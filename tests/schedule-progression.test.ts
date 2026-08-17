import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SCHEDULE_HISTORY,
  advanceScheduleTestDate,
  beginNextScheduleCycle,
  createNextSchedulePeriod,
  nextReminderDate
} from "@/lib/schedule-progression";
import { createCleanRunTestState } from "@/lib/test-state";

function publishedState() {
  const state = createCleanRunTestState("progression_run", new Date("2026-08-17T18:00:00.000Z"));
  state.period = { ...state.period, status: "published", publishedAt: "2026-08-24T16:00:00.000Z" };
  state.availability = [
    {
      id: "availability_manager",
      schedulePeriodId: state.period.id,
      userId: "emp_manager",
      submittedAt: "2026-08-20T16:00:00.000Z",
      unavailable: []
    }
  ];
  return state;
}

test("next schedule period continues directly after the published period", () => {
  const current = publishedState().period;
  const next = createNextSchedulePeriod(current);

  assert.equal(next.startDate, "2026-09-11");
  assert.equal(next.endDate, "2026-09-27");
  assert.equal(next.releaseDate, "2026-09-10");
  assert.equal(next.availabilityDeadlineAt, "2026-09-08");
  assert.equal(next.availabilityOpenAt, "2026-09-03");
  assert.equal(next.status, "draft");
});

test("starting a new cycle archives the publication and clears period-specific work", () => {
  const original = publishedState();
  const next = beginNextScheduleCycle(original, "2026-08-24T18:00:00.000Z");

  assert.equal(next.dayProgression.enabled, true);
  assert.equal(next.dayProgression.currentDate, original.period.releaseDate);
  assert.equal(next.dayProgression.cycleNumber, 2);
  assert.equal(next.scheduleHistory[0].period.id, original.period.id);
  assert.equal(next.scheduleHistory[0].shifts.length, original.shifts.length);
  assert.equal(next.period.status, "draft");
  assert(next.shifts.length > 0);
  assert(next.shifts.every((shift) => shift.schedulePeriodId === next.period.id));
  assert.deepEqual(next.availability, []);
  assert.deepEqual(next.coverage, []);
  assert.deepEqual(next.swaps, []);
});

test("simulated date advances forward and can jump to the reminder email day", () => {
  const cycle = beginNextScheduleCycle(publishedState());
  const tomorrow = advanceScheduleTestDate(cycle);
  const reminderDate = nextReminderDate(cycle);
  const reminderDay = advanceScheduleTestDate(tomorrow, reminderDate);

  assert.equal(tomorrow.dayProgression.currentDate, "2026-08-25");
  assert.equal(reminderDate, "2026-09-07");
  assert.equal(reminderDay.dayProgression.currentDate, reminderDate);
  assert.throws(() => advanceScheduleTestDate(reminderDay, reminderDate), /only move forward/);
});

test("published schedule history is bounded", () => {
  const state = publishedState();
  state.scheduleHistory = Array.from({ length: MAX_SCHEDULE_HISTORY }, (_, index) => ({
    id: `old_${index}`,
    archivedAt: `2026-08-${String(index + 1).padStart(2, "0")}T18:00:00.000Z`,
    period: { ...state.period, id: `old_${index}` },
    shifts: []
  }));

  const next = beginNextScheduleCycle(state);
  assert.equal(next.scheduleHistory.length, MAX_SCHEDULE_HISTORY);
  assert.equal(next.scheduleHistory[0].id, state.period.id);
  assert.equal(next.scheduleHistory.some((archive) => archive.id === "old_5"), false);
});
