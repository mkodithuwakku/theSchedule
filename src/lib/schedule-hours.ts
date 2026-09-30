import { storeHours, type SchedulePeriod } from "@/lib/demo-data";
import { publishedScheduleWindows } from "@/lib/schedule-progression";
import type { StoredTestState } from "@/lib/test-state-shared";

export function validTimeRange(start: string, end: string) {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  return time.test(start) && time.test(end) && start < end;
}

export function mallHoursForDate(period: SchedulePeriod, date: string) {
  return period.mallHoursOverrides?.[date] ?? storeHours.find((hours) =>
    hours.dayOfWeek === new Date(`${date}T12:00:00Z`).getUTCDay())!;
}

type HoursState = Pick<StoredTestState, "period" | "shifts" | "scheduleHistory" | "people" | "auditLog">;

export function updatePublishedMallHours<T extends HoursState>(state: T, input: {
  periodId: string; date: string; hours: { openTime: string; closeTime: string } | null;
  actorId: string; now: string; auditId: string;
}): T {
  const actor = state.people.find((person) => person.id === input.actorId);
  if (!actor?.active || actor.role !== "manager") throw new Error("Only managers can edit mall hours.");
  const window = publishedScheduleWindows(state).find((entry) => entry.period.id === input.periodId);
  if (!window || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
      !Number.isFinite(Date.parse(`${input.date}T12:00:00Z`)) ||
      new Date(`${input.date}T12:00:00Z`).toISOString().slice(0, 10) !== input.date ||
      input.date < window.period.startDate || input.date > window.period.endDate) {
    throw new Error("Select a date in a published schedule.");
  }
  if (input.hours && !validTimeRange(input.hours.openTime, input.hours.closeTime)) {
    throw new Error("Enter valid mall hours with closing time after opening time.");
  }
  const before = mallHoursForDate(window.period, input.date);
  const overrides = { ...window.period.mallHoursOverrides };
  if (input.hours) overrides[input.date] = { openTime: input.hours.openTime, closeTime: input.hours.closeTime };
  else delete overrides[input.date];
  if (JSON.stringify(overrides) === JSON.stringify(window.period.mallHoursOverrides ?? {})) return state;
  const updated = { ...window.period, mallHoursOverrides: overrides };
  const after = mallHoursForDate(updated, input.date);
  return {
    ...state,
    period: state.period.id === updated.id ? updated : state.period,
    scheduleHistory: state.scheduleHistory.map((entry) => entry.period.id === updated.id ? { ...entry, period: updated } : entry),
    auditLog: [{ id: input.auditId, actorId: input.actorId, action: "mall_hours_updated", entityType: "SchedulePeriod", entityId: updated.id,
      summary: `${input.date}: mall hours changed from ${before.openTime}-${before.closeTime} to ${after.openTime}-${after.closeTime}${input.hours ? "" : " (regular hours restored)"}.`, createdAt: input.now }, ...state.auditLog]
  };
}
