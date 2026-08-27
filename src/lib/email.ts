import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
export const OWNER_ALERT_EMAIL = process.env.OWNER_ALERT_EMAIL ?? "m.kodithuwakku803@gmail.com";

export type ScheduleEmail = {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
};

export async function sendScheduleEmail(message: ScheduleEmail) {
  if (!resend) {
    return {
      status: "queued" as const,
      providerId: null,
      reason: "RESEND_API_KEY is not configured"
    };
  }

  const result = await resend.emails.send(
    {
      from: process.env.EMAIL_FROM ?? "The Schedule <schedule@example.com>",
      to: message.to,
      subject: message.subject,
      html: message.html
    },
    message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined
  );

  if (result.error) {
    return {
      status: "failed" as const,
      providerId: null,
      reason: result.error.message
    };
  }

  return {
    status: "sent" as const,
    providerId: result.data?.id ?? null,
    reason: null
  };
}

export function ownerAlertEmail(title: string, rows: Array<{ label: string; value: string }>) {
  return {
    subject: `[The Schedule] ${title}`,
    html: `
      <h1>${title}</h1>
      <p>The Schedule needs attention.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
        ${rows
          .map(
            (row) => `
              <tr>
                <td style="font-weight: 700; border-bottom: 1px solid #ddd;">${row.label}</td>
                <td style="border-bottom: 1px solid #ddd;">${row.value}</td>
              </tr>
            `
          )
          .join("")}
      </table>
    `
  };
}

export function schedulePublishedEmail(periodName: string, scheduleUrl: string, shiftsHtml: string) {
  return {
    subject: `New schedule published: ${periodName}`,
    html: `
      <h1>${periodName}</h1>
      <p>The latest schedule is now available.</p>
      <p><a href="${scheduleUrl}">View the full schedule</a></p>
      <h2>Your shifts</h2>
      ${shiftsHtml}
    `
  };
}

export function availabilityReminderEmail(periodName: string, deadline: string, availabilityUrl: string) {
  return {
    subject: `Availability due for ${periodName}`,
    html: `
      <h1>Availability deadline</h1>
      <p>Please submit unavailable days or time ranges by ${deadline}.</p>
      <p><a href="${availabilityUrl}">Submit availability</a></p>
    `
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function employeeInviteEmail(inviteUrl: string) {
  const safeInviteUrl = escapeHtml(inviteUrl);

  return {
    subject: "You've been invited to The Schedule",
    html: `
      <div style="margin: 0 auto; max-width: 560px; padding: 32px 20px; font-family: Arial, Helvetica, sans-serif; color: #121824;">
        <h1 style="margin: 0 0 16px; font-size: 28px; line-height: 1.2;">You've been invited to The Schedule</h1>
        <p style="margin: 0 0 24px; color: #5f6877; font-size: 16px; line-height: 1.6;">
          Use the Google account this email was sent to to accept your invitation and access The Schedule.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
          <tr>
            <td style="border-radius: 10px; background: #0f62a3;">
              <a href="${safeInviteUrl}" style="display: inline-block; padding: 14px 22px; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none;">
                Accept invitation
              </a>
            </td>
          </tr>
        </table>
        <p style="margin: 0 0 8px; color: #5f6877; font-size: 13px; line-height: 1.5;">
          If the button does not work, copy and paste this link into your browser:
        </p>
        <p style="margin: 0; font-size: 13px; line-height: 1.5; word-break: break-all;">
          <a href="${safeInviteUrl}" style="color: #0f62a3;">${safeInviteUrl}</a>
        </p>
      </div>
    `
  };
}
