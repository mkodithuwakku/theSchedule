import { NextResponse } from "next/server";
import { OWNER_ALERT_EMAIL, sendScheduleEmail } from "@/lib/email";
import { getCurrentAccess } from "@/lib/access";
import { getAppBaseUrl } from "@/lib/app-url";
import { actionNotificationEmail, ownerAlertEmail } from "@/lib/email-templates";
import { appendWorkspaceNotification, readWorkspaceState } from "@/lib/workspace-state";
import type { NotificationEntry } from "@/lib/demo-data";
import { shouldSuppressShiftNotification } from "@/lib/shift-notification-policy";

type TestEmailRequest = {
  id?: string;
  userId?: string;
  to?: string;
  recipientName?: string;
  type?: string;
  subject?: string;
  html?: string;
  skipLog?: boolean;
  ownerAlert?: boolean;
  schedulePeriodId?: string;
};

export async function POST(request: Request) {
  const access = await getCurrentAccess();
  if (!access) return NextResponse.json({ error: "Sign in with an active employee account." }, { status: 401 });

  const body = (await request.json()) as TestEmailRequest;
  const employeeAllowedTypes = new Set([
    "availability_submitted",
    "coverage_requested",
    "coverage_opened",
    "coverage_offer",
    "swap_requested",
    "swap_response",
    "uat_issue_reported",
    "software_outage"
  ]);
  if (access.role !== "manager" && (body.to || !employeeAllowedTypes.has(body.type ?? ""))) {
    return NextResponse.json({ error: "Employees can only send notifications created by their own schedule actions." }, { status: 403 });
  }
  if (access.role !== "manager" && body.ownerAlert && body.type !== "uat_issue_reported" && body.type !== "software_outage") {
    return NextResponse.json({ error: "Employees cannot send this owner alert." }, { status: 403 });
  }

  const state = await readWorkspaceState(access.storeId);
  // Check persisted publication state, including requests from older open tabs.
  // A request for a different period must not inherit this period's published status.
  const notificationPeriodStatus = body.schedulePeriodId && body.schedulePeriodId !== state.period.id
    ? "draft"
    : state.period.status;
  if (shouldSuppressShiftNotification(body.type ?? "", notificationPeriodStatus)) {
    return NextResponse.json({
      suppressed: true,
      reason: "Shift changes are emailed only for the current published schedule.",
      notification: {
        id: body.id ?? `note_${Date.now()}`,
        userId: body.userId,
        type: body.type,
        subject: body.subject,
        status: "suppressed",
        createdAt: new Date().toISOString()
      }
    });
  }
  const stateRecipient = state.people.find((person) => person.id === body.userId);
  const fallbackRecipient = state.people.find((person) => person.role === "manager") ?? state.people[0];
  const recipient = body.ownerAlert
    ? {
        id: "owner_alert",
        name: "Application Owner",
        email: OWNER_ALERT_EMAIL
      }
    : stateRecipient ??
    (body.to
      ? {
          id: body.userId ?? body.to,
          name: body.recipientName ?? body.to,
          email: body.to
        }
      : fallbackRecipient);

  if (!recipient) {
    return NextResponse.json({ error: "No test recipient is configured." }, { status: 400 });
  }

  const subject = body.subject ?? `Test notification for ${state.period.name}`;
  const html =
    body.html ??
    actionNotificationEmail(
      subject,
      `This is a test notification from The Schedule for ${state.period.name}.`,
      "Open The Schedule",
      getAppBaseUrl(request)
    ).html;
  const result = await sendScheduleEmail({
    to: recipient.email,
    subject,
    html
  }).catch((error: unknown) => ({
    status: "failed" as const,
    providerId: null,
    reason: error instanceof Error ? error.message : "Unknown email provider error"
  }));

  if (!body.ownerAlert && result.status === "failed") {
    const alert = ownerAlertEmail(
      "Notification delivery failed",
      [
        { label: "Notification type", value: body.type ?? "test_email" },
        { label: "Subject", value: subject },
        { label: "Recipient", value: `${recipient.name} <${recipient.email}>` },
        { label: "Provider reason", value: result.reason ?? "Unknown failure" },
        { label: "Schedule period", value: state.period.name },
        { label: "Occurred at", value: new Date().toISOString() }
      ],
      getAppBaseUrl(request)
    );

    await sendScheduleEmail({
      to: OWNER_ALERT_EMAIL,
      subject: alert.subject,
      html: alert.html
    }).catch(() => null);
  }

  const notification: NotificationEntry = {
    id: body.id ?? `note_${Date.now()}`,
    userId: recipient.id,
    type: body.type ?? "test_email",
    subject,
    status: result.status,
    createdAt: new Date().toISOString()
  };

  if (!body.skipLog) {
    await appendWorkspaceNotification(access.storeId, notification);
  }

  return NextResponse.json({
    notification,
    recipient: {
      id: recipient.id,
      name: recipient.name,
      email: recipient.email
    },
    provider: result
  });
}
