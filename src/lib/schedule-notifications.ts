import { Prisma } from "@prisma/client";
import { sendScheduleEmail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import {
  buildAvailabilityReminderPlans,
  buildPublishedSchedulePlans,
  dispatchNotificationPlans,
  type NotificationDispatchResult,
  type NotificationPlan,
  type NotificationProviderResult,
  type RolloutMember
} from "@/lib/schedule-rollout";
import { normalizeTestState } from "@/lib/test-state";
import type { StoredTestState } from "@/lib/test-state-shared";

function deliveryStatus(status: string): NotificationDispatchResult["status"] {
  if (status === "sent" || status === "failed") return status;
  return "queued";
}

function membersForStore(
  memberships: Array<{
    active: boolean;
    user: { id: string; name: string | null; email: string | null; active: boolean };
  }>
) {
  return memberships.flatMap<RolloutMember>((membership) => {
    if (!membership.active || !membership.user.active || !membership.user.email) return [];
    return [
      {
        userId: membership.user.id,
        name: membership.user.name?.trim() || membership.user.email,
        email: membership.user.email.trim().toLowerCase(),
        active: true
      }
    ];
  });
}

async function claimNotification(plan: NotificationPlan) {
  try {
    await prisma.notificationLog.create({
      data: {
        dedupKey: plan.dedupKey,
        storeId: plan.storeId,
        userId: plan.userId,
        type: plan.type,
        subject: plan.subject,
        status: "sending",
        metadataJson: plan.metadata
      }
    });
    return { claimed: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.notificationLog.findUnique({ where: { dedupKey: plan.dedupKey } });
      return { claimed: false, status: deliveryStatus(existing?.status ?? "queued") };
    }
    throw error;
  }
}

async function sendNotification(plan: NotificationPlan) {
  return sendScheduleEmail({
    to: plan.to,
    subject: plan.subject,
    html: plan.html,
    idempotencyKey: plan.dedupKey
  });
}

async function completeNotification(plan: NotificationPlan, result: NotificationProviderResult) {
  await prisma.notificationLog.update({
    where: { dedupKey: plan.dedupKey },
    data: {
      status: result.status,
      sentAt: result.status === "sent" ? new Date() : null,
      providerId: result.providerId,
      failureReason: result.reason
    }
  });
}

const dispatcher = {
  claim: claimNotification,
  send: sendNotification,
  complete: completeNotification
};

export async function sendDueAvailabilityReminders(now = new Date()) {
  const stores = await prisma.store.findMany({
    include: {
      workspaceState: true,
      memberships: {
        where: { active: true, user: { active: true } },
        include: { user: true }
      }
    }
  });

  const storeResults: Array<{ storeId: string; periodId: string; deliveries: NotificationDispatchResult[] }> = [];
  for (const store of stores) {
    if (!store.workspaceState) continue;
    const state = normalizeTestState(store.workspaceState.data as Partial<StoredTestState>);
    const plans = buildAvailabilityReminderPlans({
      storeId: store.id,
      timeZone: store.timezone,
      state,
      members: membersForStore(store.memberships),
      appUrl: getAppBaseUrl(),
      now
    });
    if (plans.length === 0) continue;
    storeResults.push({ storeId: store.id, periodId: state.period.id, deliveries: await dispatchNotificationPlans(plans, dispatcher) });
  }

  return storeResults;
}

export async function sendPublishedScheduleNotifications(storeId: string, state: StoredTestState) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      memberships: {
        where: { active: true, user: { active: true } },
        include: { user: true }
      }
    }
  });
  if (!store) throw new Error("Store is not configured.");

  const plans = buildPublishedSchedulePlans({
    storeId,
    timeZone: store.timezone,
    state,
    members: membersForStore(store.memberships),
    appUrl: getAppBaseUrl()
  });
  return dispatchNotificationPlans(plans, dispatcher);
}
