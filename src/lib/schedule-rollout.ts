import type { SchedulePeriod, Shift } from "@/lib/demo-data";
import { availabilityReminderEmail, schedulePublishedEmail } from "@/lib/email";
import type { StoredTestState } from "@/lib/test-state-shared";

export const AVAILABILITY_REMINDER_DAYS_BEFORE_RELEASE = 3;

export type RolloutMember = {
  userId: string;
  name: string;
  email: string;
  active: boolean;
};

export type RolloutRecipient = RolloutMember & {
  workspacePersonId: string;
};

export type NotificationPlan = {
  dedupKey: string;
  storeId: string;
  userId: string;
  workspacePersonId: string;
  recipientName: string;
  to: string;
  type: "availability_reminder" | "schedule_published";
  subject: string;
  html: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type NotificationProviderResult = {
  status: "queued" | "sent" | "failed";
  providerId: string | null;
  reason: string | null;
};

export type NotificationDispatchResult = {
  plan: NotificationPlan;
  status: "queued" | "sent" | "failed";
  providerId: string | null;
  reason: string | null;
  duplicate: boolean;
};

export type NotificationDispatcher = {
  claim: (plan: NotificationPlan) => Promise<{ claimed: boolean; status?: NotificationDispatchResult["status"] }>;
  send: (plan: NotificationPlan) => Promise<NotificationProviderResult>;
  complete: (plan: NotificationPlan, result: NotificationProviderResult) => Promise<void>;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isoDateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid ISO date: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function addIsoDays(value: string, days: number) {
  const { year, month, day } = isoDateParts(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function availabilityReminderDate(releaseDate: string) {
  return addIsoDays(releaseDate, -AVAILABILITY_REMINDER_DAYS_BEFORE_RELEASE);
}

export function isAvailabilityReminderDue(period: SchedulePeriod, now: Date, timeZone: string) {
  return period.status === "draft" && dateInTimeZone(now, timeZone) === availabilityReminderDate(period.releaseDate);
}

export function activeRolloutRecipients(state: StoredTestState, members: RolloutMember[]) {
  const activePeopleByEmail = new Map(
    state.people.filter((person) => person.active).map((person) => [person.email.trim().toLowerCase(), person])
  );

  return members.flatMap<RolloutRecipient>((member) => {
    if (!member.active) return [];
    const person = activePeopleByEmail.get(member.email.trim().toLowerCase());
    if (!person) return [];
    return [{ ...member, workspacePersonId: person.id }];
  });
}

function readableDate(value: string, timeZone: string) {
  const { year, month, day } = isoDateParts(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function readableTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date(Date.UTC(2000, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(date);
}

function shiftsHtml(shifts: Shift[], timeZone: string) {
  if (shifts.length === 0) return "<p>You do not currently have any assigned shifts in this schedule.</p>";
  const items = [...shifts]
    .sort((left, right) => `${left.date}${left.startTime}`.localeCompare(`${right.date}${right.startTime}`))
    .map(
      (shift) =>
        `<li><strong>${escapeHtml(readableDate(shift.date, timeZone))}</strong>: ${escapeHtml(readableTime(shift.startTime))}-${escapeHtml(readableTime(shift.endTime))}</li>`
    )
    .join("");
  return `<ul>${items}</ul>`;
}

export function buildAvailabilityReminderPlans(input: {
  storeId: string;
  timeZone: string;
  state: StoredTestState;
  members: RolloutMember[];
  appUrl: string;
  now: Date;
}) {
  const { storeId, timeZone, state, members, appUrl, now } = input;
  if (!isAvailabilityReminderDue(state.period, now, timeZone)) return [];

  return activeRolloutRecipients(state, members).map<NotificationPlan>((recipient) => {
    const message = availabilityReminderEmail(state.period.name, state.period.availabilityDeadlineAt, appUrl);
    return {
      dedupKey: `availability-reminder:${storeId}:${state.period.id}:${state.period.releaseDate}:${recipient.userId}`,
      storeId,
      userId: recipient.userId,
      workspacePersonId: recipient.workspacePersonId,
      recipientName: recipient.name,
      to: recipient.email,
      type: "availability_reminder",
      subject: message.subject,
      html: message.html,
      metadata: {
        schedulePeriodId: state.period.id,
        releaseDate: state.period.releaseDate,
        availabilityDeadlineAt: state.period.availabilityDeadlineAt,
        timeZone
      }
    };
  });
}

export function buildPublishedSchedulePlans(input: {
  storeId: string;
  timeZone: string;
  state: StoredTestState;
  members: RolloutMember[];
  appUrl: string;
}) {
  const { storeId, timeZone, state, members, appUrl } = input;
  return activeRolloutRecipients(state, members).map<NotificationPlan>((recipient) => {
    const assignedShifts = state.shifts.filter((shift) => shift.employeeId === recipient.workspacePersonId);
    const message = schedulePublishedEmail(state.period.name, appUrl, shiftsHtml(assignedShifts, timeZone));
    return {
      dedupKey: `schedule-published:${storeId}:${state.period.id}:${recipient.userId}`,
      storeId,
      userId: recipient.userId,
      workspacePersonId: recipient.workspacePersonId,
      recipientName: recipient.name,
      to: recipient.email,
      type: "schedule_published",
      subject: message.subject,
      html: message.html,
      metadata: {
        schedulePeriodId: state.period.id,
        releaseDate: state.period.releaseDate,
        assignedShiftCount: assignedShifts.length,
        timeZone
      }
    };
  });
}

export async function dispatchNotificationPlans(plans: NotificationPlan[], dispatcher: NotificationDispatcher) {
  const results: NotificationDispatchResult[] = [];

  for (const plan of plans) {
    const claim = await dispatcher.claim(plan);
    if (!claim.claimed) {
      results.push({
        plan,
        status: claim.status ?? "queued",
        providerId: null,
        reason: null,
        duplicate: true
      });
      continue;
    }

    let provider: NotificationProviderResult;
    try {
      provider = await dispatcher.send(plan);
    } catch (error) {
      provider = {
        status: "failed",
        providerId: null,
        reason: error instanceof Error ? error.message : "Unknown email provider error"
      };
    }
    await dispatcher.complete(plan, provider);
    results.push({ plan, ...provider, duplicate: false });
  }

  return results;
}
