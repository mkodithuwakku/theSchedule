import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import type { SchedulePeriod, Shift } from "@/lib/demo-data";
import { getCurrentAccess, normalizeEmail } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { sendPublishedScheduleNotifications } from "@/lib/schedule-notifications";
import { getScheduleBlockingIssues } from "@/lib/schedule-builder";
import { assertWorkspaceRevision, WorkspaceConflictError, StaleUatRunError, updateWorkspaceState, readWorkspaceState, writeWorkspaceState } from "@/lib/workspace-state";

type PublishRequest = {
  uatRunId?: string;
  workspaceVersion?: number;
  period?: SchedulePeriod;
  shifts?: Shift[];
};

export async function POST(request: Request) {
  const access = await getCurrentAccess();
  if (!access) return NextResponse.json({ error: "Sign in with an active employee account." }, { status: 401 });
  if (access.role !== UserRole.manager) {
    return NextResponse.json({ error: "Only active managers can publish schedules." }, { status: 403 });
  }

  const body = (await request.json()) as PublishRequest;
  if (!body.period || !Array.isArray(body.shifts) || body.shifts.length === 0) {
    return NextResponse.json({ error: "A schedule period and at least one shift are required." }, { status: 400 });
  }

  const existing = await readWorkspaceState(access.storeId);
  try {
    assertWorkspaceRevision(existing, body);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 409 });
  }
  if (body.period.id !== existing.period.id) {
    return NextResponse.json({ error: "The schedule period changed. Refresh before publishing." }, { status: 409 });
  }
  if (body.shifts.some((shift) => shift.schedulePeriodId !== body.period?.id)) {
    return NextResponse.json({ error: "Every shift must belong to the active schedule period." }, { status: 400 });
  }

  const blockingIssues = getScheduleBlockingIssues(body.shifts, existing.availability, existing.people);
  if (blockingIssues.length > 0) {
    return NextResponse.json(
      {
        error: `The schedule has ${blockingIssues.length} blocking error${blockingIssues.length === 1 ? "" : "s"}. Resolve every unfilled, duplicate, unavailable, or invalid shift before publishing.`,
        issues: blockingIssues
      },
      { status: 400 }
    );
  }

  const publishedAt = new Date().toISOString();
  const publishedPeriod: SchedulePeriod = { ...body.period, status: "published", publishedAt };
  const publishedShifts = body.shifts.map((shift) => ({
    ...shift,
    originalEmployeeId: shift.originalEmployeeId ?? shift.employeeId,
    originalStartTime: shift.originalStartTime ?? shift.startTime,
    originalEndTime: shift.originalEndTime ?? shift.endTime
  }));
  const workspaceManager = existing.people.find((person) => normalizeEmail(person.email) === access.email);
  const publishAudit = {
    id: `audit_publish_${Date.now()}`,
    actorId: workspaceManager?.id ?? access.userId,
    action: "schedule_published",
    entityType: "SchedulePeriod",
    entityId: publishedPeriod.id,
    summary: `Published ${publishedPeriod.name}.`,
    createdAt: publishedAt
  };
  let publishedState;
  try {
    publishedState = await writeWorkspaceState(access.storeId, {
      ...existing,
      period: publishedPeriod,
      shifts: publishedShifts,
      auditLog: [publishAudit, ...existing.auditLog]
    });
  } catch (error) {
    if (error instanceof WorkspaceConflictError || error instanceof StaleUatRunError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  await prisma.auditLog.create({
    data: {
      storeId: access.storeId,
      actorUserId: access.userId,
      action: "schedule_published",
      entityType: "SchedulePeriod",
      entityId: publishedPeriod.id,
      afterJson: {
        name: publishedPeriod.name,
        releaseDate: publishedPeriod.releaseDate,
        publishedAt,
        shiftCount: publishedShifts.length
      }
    }
  });

  const deliveries = await sendPublishedScheduleNotifications(access.storeId, publishedState);
  const deliveryNotifications = deliveries.map((delivery) => ({
    id: delivery.plan.dedupKey,
    userId: delivery.plan.workspacePersonId,
    type: delivery.plan.type,
    subject: delivery.plan.subject,
    status: delivery.status,
    createdAt: publishedAt
  }));
  const deliveryIds = new Set(deliveryNotifications.map((notification) => notification.id));
  const finalState = await updateWorkspaceState(access.storeId, publishedState.uatRunId, (latest) => ({
    ...latest,
    notifications: [
      ...deliveryNotifications,
      ...latest.notifications.filter((notification) => !deliveryIds.has(notification.id))
    ]
  }));

  return NextResponse.json({
    state: finalState,
    deliveries: deliveries.map((delivery) => ({
      userId: delivery.plan.workspacePersonId,
      email: delivery.plan.to,
      status: delivery.status,
      providerId: delivery.providerId,
      reason: delivery.reason,
      duplicate: delivery.duplicate
    }))
  });
}
