import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SCHEDULE_HISTORY,
  advanceScheduleTestDate,
  beginNextScheduleCycle,
  createNextSchedulePeriod,
  nextReminderDate
} from "@/lib/schedule-progression";
import { createCleanRunTestState, createDefaultTestState } from "@/lib/test-state";
import { addIsoDays } from "@/lib/schedule-rollout";
import { generateDefaultShifts, getDatesInPeriod } from "@/lib/demo-data";

function publishedState() {
  const state = createDefaultTestState("progression_run");
  state.period = { ...state.period, status: "published", publishedAt: "2026-09-12T16:00:00.000Z" };
  state.availability = [
    {
      id: "availability_manager",
      schedulePeriodId: state.period.id,
      userId: "emp_manager",
      submittedAt: "2026-09-09T16:00:00.000Z",
      unavailable: []
    }
  ];
  return state;
}

test("next schedule period opens the first half of October", () => {
  const current = publishedState().period;
  const next = createNextSchedulePeriod(current);

  assert.equal(next.startDate, "2026-10-01");
  assert.equal(next.endDate, "2026-10-15");
  assert.equal(next.releaseDate, "2026-09-30");
  assert.equal(next.availabilityDeadlineAt, "2026-09-28");
  assert.equal(next.availabilityOpenAt, "2026-09-23");
  assert.equal(next.status, "draft");
});

test("semi-monthly progression alternates between days 1-15 and day 16 through month-end", () => {
  const octoberFirstHalf = createNextSchedulePeriod(publishedState().period);
  const octoberSecondHalf = createNextSchedulePeriod(octoberFirstHalf);
  const novemberFirstHalf = createNextSchedulePeriod(octoberSecondHalf);

  assert.deepEqual(
    [octoberFirstHalf.startDate, octoberFirstHalf.endDate],
    ["2026-10-01", "2026-10-15"]
  );
  assert.deepEqual(
    [octoberSecondHalf.startDate, octoberSecondHalf.endDate],
    ["2026-10-16", "2026-10-31"]
  );
  assert.deepEqual(
    [novemberFirstHalf.startDate, novemberFirstHalf.endDate],
    ["2026-11-01", "2026-11-15"]
  );
});

test("semi-monthly progression respects February and leap years", () => {
  const commonFebruary = createNextSchedulePeriod({
    ...publishedState().period,
    endDate: "2027-02-15"
  });
  const leapFebruary = createNextSchedulePeriod({
    ...publishedState().period,
    endDate: "2028-02-15"
  });

  assert.deepEqual([commonFebruary.startDate, commonFebruary.endDate], ["2027-02-16", "2027-02-28"]);
  assert.deepEqual([leapFebruary.startDate, leapFebruary.endDate], ["2028-02-16", "2028-02-29"]);
});

test("every period over four years covers exactly 1-15 or 16-month-end with no gaps or overlaps", () => {
  let current = { ...publishedState().period, endDate: "2025-12-31" };
  for (let year = 2026; year <= 2029; year++) {
    for (let month = 1; month <= 12; month++) {
      const prefix = `${year}-${String(month).padStart(2, "0")}`;
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      for (const [start, end] of [[1, 15], [16, lastDay]]) {
        const next = createNextSchedulePeriod(current);
        assert.equal(next.startDate, `${prefix}-${String(start).padStart(2, "0")}`);
        assert.equal(next.endDate, `${prefix}-${end}`);
        assert.equal(next.startDate, addIsoDays(current.endDate, 1));
        assert.equal(getDatesInPeriod(next).length, end - start + 1);
        const shifts = generateDefaultShifts(next);
        assert.equal(new Set(shifts.map((shift) => shift.date)).size, end - start + 1);
        assert(shifts.every((shift) => shift.date >= next.startDate && shift.date <= next.endDate));
        current = next;
      }
    }
  }
});

test("clean-run suggestions stay on canonical boundaries around the 15th, 16th and month-end", () => {
  for (const day of [1, 8, 12, 13, 14, 15, 16, 28, 29, 30]) {
    const today = `2026-09-${String(day).padStart(2, "0")}`;
    const { period } = createCleanRunTestState("test", new Date(`${today}T18:00:00Z`));
    assert(["01", "16"].includes(period.startDate.slice(-2)));
    assert(period.availabilityDeadlineAt > today);
  }
});

test("starting a new cycle archives the publication and clears period-specific work", () => {
  const original = publishedState();
  const next = beginNextScheduleCycle(original, "2026-09-12T18:00:00.000Z");

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

  assert.equal(tomorrow.dayProgression.currentDate, "2026-09-13");
  assert.equal(reminderDate, "2026-09-27");
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
