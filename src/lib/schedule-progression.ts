import type { SchedulePeriod } from "@/lib/demo-data";
import { generateDefaultShifts } from "@/lib/demo-data";
import { addIsoDays, availabilityReminderDate } from "@/lib/schedule-rollout";
import type { ArchivedSchedule, StoredTestState } from "@/lib/test-state-shared";

export const MAX_SCHEDULE_HISTORY = 6;

function isoDayNumber(value: string) {
  return Math.floor(new Date(`${value}T12:00:00.000Z`).getTime() / 86_400_000);
}

function periodLengthInDays(period: SchedulePeriod) {
  return Math.max(1, isoDayNumber(period.endDate) - isoDayNumber(period.startDate) + 1);
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
  const endDate = addIsoDays(startDate, periodLengthInDays(current) - 1);
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
