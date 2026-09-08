import type { SchedulePeriod, Shift } from "@/lib/demo-data";
import { generateDefaultShifts } from "@/lib/demo-data";
import { addIsoDays, availabilityReminderDate, dateInTimeZone } from "@/lib/schedule-rollout";
import type { ArchivedSchedule, StoredTestState } from "@/lib/test-state-shared";

export const MAX_SCHEDULE_HISTORY = 6;

function semiMonthlyPeriodEnd(startDate: string) {
  const [year, month, day] = startDate.split("-").map(Number);
  if (day <= 14) return `${startDate.slice(0, 8)}14`;

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${startDate.slice(0, 8)}${String(lastDay).padStart(2, "0")}`;
}

function periodLabel(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
  return `${formatter.format(new Date(`${startDate}T12:00:00.000Z`))} - ${formatter.format(new Date(`${endDate}T12:00:00.000Z`))}`;
}

export function createNextSchedulePeriod(current: SchedulePeriod): SchedulePeriod {
  const startDate = addIsoDays(current.endDate, 1);
  const endDate = semiMonthlyPeriodEnd(startDate);
  const releaseDate = addIsoDays(startDate, -1);
  const availabilityDeadlineAt = addIsoDays(releaseDate, -2);
  const availabilityOpenAt = addIsoDays(availabilityDeadlineAt, -5);

  return {
    id: `period_${startDate.replaceAll("-", "")}_${endDate.replaceAll("-", "")}`,
    name: periodLabel(startDate, endDate),
    startDate,
    endDate,
    releaseDate,
    availabilityOpenAt,
    availabilityDeadlineAt,
    status: "draft"
  };
}

export function beginNextScheduleCycle(state: StoredTestState, archivedAt = new Date().toISOString()): StoredTestState {
  if (state.period.status !== "published") {
    throw new Error("Publish the current schedule before starting the next schedule cycle.");
  }

  const archive: ArchivedSchedule = {
    id: state.period.id,
    archivedAt,
    period: state.period,
    shifts: state.shifts
  };
  const nextPeriod = createNextSchedulePeriod(state.period);
  const currentDate = state.dayProgression.enabled
    ? state.dayProgression.currentDate
    : state.period.releaseDate;

  return {
    ...state,
    period: nextPeriod,
    shifts: generateDefaultShifts(nextPeriod),
    availability: [],
    coverage: [],
    swaps: [],
    availabilityDrafts: {},
    scheduleHistory: [archive, ...state.scheduleHistory.filter((item) => item.id !== archive.id)].slice(
      0,
      MAX_SCHEDULE_HISTORY
    ),
    dayProgression: {
      enabled: true,
      currentDate,
      cycleNumber: state.dayProgression.enabled ? state.dayProgression.cycleNumber + 1 : 2
    },
    auditLog: [
      {
        id: `audit_next_cycle_${Date.now()}`,
        actorId: "emp_manager",
        action: "next_schedule_cycle_started",
        entityType: "SchedulePeriod",
        entityId: nextPeriod.id,
        summary: `Archived ${state.period.name} and opened ${nextPeriod.name} for day-progression testing.`,
        createdAt: archivedAt
      },
      ...state.auditLog
    ]
  };
}

export function advanceScheduleTestDate(state: StoredTestState, targetDate?: string): StoredTestState {
  if (!state.dayProgression.enabled) {
    throw new Error("Start the next schedule cycle before advancing the simulated date.");
  }

  const nextDate = targetDate ?? addIsoDays(state.dayProgression.currentDate, 1);
  if (nextDate <= state.dayProgression.currentDate) {
    throw new Error("The simulated date can only move forward.");
  }

  return {
    ...state,
    dayProgression: {
      ...state.dayProgression,
      currentDate: nextDate
    },
    auditLog: [
      {
        id: `audit_day_progression_${Date.now()}`,
        actorId: "emp_manager",
        action: "simulated_date_advanced",
        entityType: "SchedulePeriod",
        entityId: state.period.id,
        summary: `Advanced the shared UAT date to ${nextDate}.`,
        createdAt: new Date().toISOString()
      },
      ...state.auditLog
    ]
  };
}

export function nextReminderDate(state: StoredTestState) {
  return availabilityReminderDate(state.period.releaseDate);
}

export function simulatedDateAsEdmontonNoon(value: string) {
  return new Date(`${value}T18:00:00.000Z`);
}

/** Published windows remain usable while a later period is being prepared. */
export function publishedScheduleWindows(state: Pick<StoredTestState, "period" | "shifts" | "scheduleHistory">) {
  return [
    ...(state.period.status === "published" ? [{ period: state.period, shifts: state.shifts }] : []),
    ...state.scheduleHistory.filter((entry) => entry.period.status !== "draft")
  ].sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
}

export function allWorkspaceShifts(state: Pick<StoredTestState, "shifts" | "scheduleHistory">): Shift[] {
  return [...new Map([...state.shifts, ...state.scheduleHistory.flatMap((entry) => entry.shifts)]
    .map((shift) => [shift.id, shift])).values()];
}

export function assignWorkspaceShifts<T extends Pick<StoredTestState, "shifts" | "scheduleHistory">>(
  state: T, assignments: Record<string, string | undefined>
): T {
  const update = (shift: Shift) => Object.hasOwn(assignments, shift.id)
    ? { ...shift, employeeId: assignments[shift.id] } : shift;
  return { ...state, shifts: state.shifts.map(update),
    scheduleHistory: state.scheduleHistory.map((entry) => ({ ...entry, shifts: entry.shifts.map(update) })) };
}

/** Idempotent daily production transition. Never discards an unfinished draft or uses the test clock. */
export function openDueScheduleCycle(state: StoredTestState, now = new Date(), timeZone = "America/Edmonton"): StoredTestState {
  if (state.dayProgression.enabled || state.period.status !== "published") return state;
  const nextPeriod = createNextSchedulePeriod(state.period);
  const today = dateInTimeZone(now, timeZone);
  if (today < nextPeriod.availabilityOpenAt) return state;

  const next = beginNextScheduleCycle(state, now.toISOString());
  const periodIds = new Set([next.period.id, ...next.scheduleHistory.map((entry) => entry.period.id)]);
  const shiftIds = new Set(allWorkspaceShifts(next).map((shift) => shift.id));
  return {
    ...next,
    // Old availability and requests still govern shifts in the running published schedule.
    availability: state.availability.filter((entry) => periodIds.has(entry.schedulePeriodId)),
    coverage: state.coverage.filter((entry) => shiftIds.has(entry.shiftId)),
    swaps: state.swaps.filter((entry) => shiftIds.has(entry.requesterShiftId) && (!entry.targetShiftId || shiftIds.has(entry.targetShiftId))),
    dayProgression: { enabled: false, currentDate: today, cycleNumber: state.dayProgression.cycleNumber + 1 },
    auditLog: [{
      id: `audit_rollover_${next.period.id}`, actorId: "system", action: "schedule_window_opened",
      entityType: "SchedulePeriod", entityId: next.period.id,
      summary: `Opened ${next.period.name} for availability and scheduling. Published shifts and requests remain available.`,
      createdAt: now.toISOString()
    }, ...state.auditLog]
  };
}
