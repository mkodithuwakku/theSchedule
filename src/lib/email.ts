import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export type ScheduleEmail = {
  to: string;
  subject: string;
  html: string;
};

export async function sendScheduleEmail(message: ScheduleEmail) {
  if (!resend) {
    return {
      status: "queued" as const,
      providerId: null,
      reason: "RESEND_API_KEY is not configured"
    };
  }

  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "The Schedule <schedule@example.com>",
    to: message.to,
    subject: message.subject,
    html: message.html
  });

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
