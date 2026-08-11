import { NextResponse } from "next/server";
import { OWNER_ALERT_EMAIL, ownerAlertEmail, sendScheduleEmail } from "@/lib/email";
import { getCurrentAccess } from "@/lib/access";
import { appendWorkspaceNotification, readWorkspaceState } from "@/lib/workspace-state";
import type { NotificationEntry } from "@/lib/demo-data";

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
    `<p>This is a test notification from The Schedule for ${state.period.name}.</p>`;
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
    const alert = ownerAlertEmail("Notification delivery failed", [
      { label: "Notification type", value: body.type ?? "test_email" },
      { label: "Subject", value: subject },
      { label: "Recipient", value: `${recipient.name} <${recipient.email}>` },
      { label: "Provider reason", value: result.reason ?? "Unknown failure" },
      { label: "Schedule period", value: state.period.name },
      { label: "Occurred at", value: new Date().toISOString() }
    ]);

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
