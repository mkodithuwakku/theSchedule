import { NextResponse } from "next/server";
import { OWNER_ALERT_EMAIL, ownerAlertEmail, sendScheduleEmail } from "@/lib/email";
import { appendTestNotification, readTestState } from "@/lib/test-state";
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
  const body = (await request.json()) as TestEmailRequest;
  const state = await readTestState();
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
    await appendTestNotification(notification);
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
