import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultTestState, normalizeTestState } from "@/lib/test-state";
import { mallHoursForDate, updatePublishedMallHours } from "@/lib/schedule-hours";
import { openDueScheduleCycle, publishedScheduleWindows } from "@/lib/schedule-progression";
import { authorizeEmployeeStateUpdate } from "@/lib/workspace-state";

function fixture(archived = false) {
  let state = createDefaultTestState();
  state.period.status = "published";
  const manager = state.people.find((person) => person.role === "manager")!;
  const employee = state.people.find((person) => person.role === "employee")!;
  const input = { periodId: state.period.id, date: state.period.startDate, hours: { openTime: "11:00", closeTime: "17:00" }, actorId: manager.id, now: "2026-09-28T18:00:00Z", auditId: "hours" };
  if (archived) state = openDueScheduleCycle(state, new Date(input.now));
  return { state, input, employee };
}

test("published mall hours are date-specific, persisted, audited and manager-only for current and historical periods", () => {
  for (const archived of [false, true]) {
    const { state, input, employee } = fixture(archived);
    const original = structuredClone(state);
    const result = updatePublishedMallHours(state, input);
    const period = publishedScheduleWindows(result).find((entry) => entry.period.id === input.periodId)!.period;
    assert.deepEqual(mallHoursForDate(period, input.date), input.hours);
    assert.deepEqual(mallHoursForDate(period, "2026-09-17"), mallHoursForDate(publishedScheduleWindows(state)[0].period, "2026-09-17"));
    assert.deepEqual(result.shifts, state.shifts);
    assert.deepEqual(result.notifications, state.notifications);
    assert.deepEqual(result.coverage, state.coverage);
    assert.deepEqual(result.swaps, state.swaps);
    assert.equal(result.auditLog[0].actorId, input.actorId);
    assert.match(result.auditLog[0].summary, /11:00-17:00/);
    assert.deepEqual(state, original);
    if (archived) assert.deepEqual(result.period, state.period);
    assert.equal(updatePublishedMallHours(result, input), result);
    const reloaded = normalizeTestState(JSON.parse(JSON.stringify(result)));
    assert.deepEqual(mallHoursForDate(publishedScheduleWindows(reloaded).find((entry) => entry.period.id === input.periodId)!.period, input.date), input.hours);
    const forged = authorizeEmployeeStateUpdate(state, result, employee.id);
    assert.deepEqual(forged.period, state.period);
    assert.deepEqual(forged.scheduleHistory, state.scheduleHistory);
    const reset = updatePublishedMallHours(result, { ...input, hours: null });
    assert.deepEqual(mallHoursForDate(publishedScheduleWindows(reset).find((entry) => entry.period.id === input.periodId)!.period, input.date), mallHoursForDate(publishedScheduleWindows(state)[0].period, input.date));
  }
});

test("mall hours survive rollover without leaking into the new draft", () => {
  const { state, input } = fixture();
  const result = openDueScheduleCycle(updatePublishedMallHours(state, input), new Date(input.now));
  assert.equal(result.period.mallHoursOverrides, undefined);
  assert.deepEqual(result.scheduleHistory[0].period.mallHoursOverrides?.[input.date], input.hours);
});

test("mall hours reject unauthorized users, drafts, invalid dates and invalid times", () => {
  const { state, input, employee } = fixture();
  assert.throws(() => updatePublishedMallHours(state, { ...input, actorId: employee.id }), /Only managers/);
  for (const date of ["2026-09-01", "2026-09-31", "invalid"]) assert.throws(() => updatePublishedMallHours(state, { ...input, date }), /published schedule/);
  assert.throws(() => updatePublishedMallHours({ ...state, period: { ...state.period, status: "draft" } }, input), /published schedule/);
  for (const [openTime, closeTime] of [["", "17:00"], ["25:00", "26:00"], ["17:00", "11:00"], ["11:00", "11:00"]]) {
    assert.throws(() => updatePublishedMallHours(state, { ...input, hours: { openTime, closeTime } }), /valid mall hours/);
  }
});
