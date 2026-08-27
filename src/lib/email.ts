import { Resend } from "resend";

export {
  actionNotificationEmail,
  availabilityReminderEmail,
  employeeInviteEmail,
  ownerAlertEmail,
  schedulePublishedEmail
} from "@/lib/email-templates";

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
