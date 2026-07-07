import { NextResponse } from "next/server";
import { sendScheduleEmail } from "@/lib/email";
import { appendTestNotification, readTestState } from "@/lib/test-state";
import type { NotificationEntry } from "@/lib/demo-data";

type TestEmailRequest = {
  userId?: string;
  subject?: string;
  html?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as TestEmailRequest;
  const state = await readTestState();
  const recipient =
    state.people.find((person) => person.id === body.userId) ??
    state.people.find((person) => person.role === "manager") ??
    state.people[0];

  if (!recipient) {
    return NextResponse.json({ error: "No test recipient is configured." }, { status: 400 });
  }

  const subject = body.subject ?? `Test notification for ${state.period.name}`;
  const result = await sendScheduleEmail({
    to: recipient.email,
    subject,
    html:
      body.html ??
      `<p>This is a test notification from The Schedule for ${state.period.name}.</p>`
  });

  const notification: NotificationEntry = {
    id: `note_${Date.now()}`,
    userId: recipient.id,
    type: "test_email",
    subject,
    status: result.status,
    createdAt: new Date().toISOString()
  };

  await appendTestNotification(notification);

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
