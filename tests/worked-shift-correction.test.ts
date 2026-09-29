import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultTestState } from "@/lib/test-state";
import { correctWorkedShift } from "@/lib/worked-shift-correction";
import { allWorkspaceShifts, openDueScheduleCycle } from "@/lib/schedule-progression";
import { calculateHours } from "@/lib/demo-data";
import { authorizeEmployeeStateUpdate } from "@/lib/workspace-state";

function fixture(archived = false) {
  let state = createDefaultTestState();
  state.period.status = "published";
  const manager = state.people.find((person) => person.role === "manager")!;
  const employee = state.people.find((person) => person.role === "employee")!;
  const shift = { ...state.shifts[0], employeeId: manager.id, originalEmployeeId: manager.id };
  state.shifts = [shift];
  state.coverage = [
    { id: "approved", shiftId: shift.id, requestedById: employee.id, claimedById: manager.id, status: "approved", reason: "Old coverage" },
    { id: "pending", shiftId: shift.id, requestedById: manager.id, status: "open", reason: "Sick" }
  ];
  state.swaps = [{ id: "pending-swap", requesterShiftId: shift.id, requesterId: manager.id, status: "pending_employee_response", reason: "" }];
  if (archived) state = openDueScheduleCycle(state, new Date("2026-09-28T18:00:00Z"));
  const input = { shiftId: shift.id, employeeId: employee.id, actorId: manager.id, reason: "Employee covered for sick manager", today: "2026-09-28", now: "2026-09-28T18:00:00Z", auditId: "correction" };
  return { state, manager, employee, shift, input };
}

test("manager corrections preserve original assignments and unrelated data in current and historical publications", () => {
  for (const archived of [false, true]) {
    const { state, manager, employee, shift, input } = fixture(archived);
    // Actual work can differ from previously submitted availability or planned staffing.
    state.availability.push({ id: "unavailable", userId: employee.id, schedulePeriodId: shift.schedulePeriodId, unavailable: [{ id: "day", userId: employee.id, date: shift.date, allDay: true, unavailableType: "full_day" }] });
    const original = structuredClone(state);
    const result = correctWorkedShift(state, input);
    const corrected = allWorkspaceShifts(result).find((item) => item.id === shift.id)!;
    assert.equal(corrected.employeeId, employee.id);
    assert.equal(corrected.originalEmployeeId, manager.id);
    assert.equal(corrected.startTime, shift.startTime);
    assert.equal(corrected.endTime, shift.endTime);
    assert.equal(calculateHours(state.people, [corrected]).find((row) => row.employeeId === employee.id)?.shifts, 1);
    assert.equal(calculateHours(state.people, [corrected], true).find((row) => row.employeeId === manager.id)?.shifts, 1);
    assert.equal(result.coverage[0].status, "approved");
    assert.equal(result.coverage[1].status, "cancelled");
    assert.equal(result.swaps[0].status, "cancelled");
    assert.match(result.auditLog[0].summary, /changed worked employee/);
    assert.equal(result.auditLog[0].actorId, manager.id);
    for (const key of ["availability", "availabilityDrafts", "people", "notifications", "inviteAcceptances", "period", "workspaceVersion", "uatRunId"] as const) assert.deepEqual(result[key], state[key]);
    if (archived) assert.deepEqual(result.shifts, state.shifts, "October draft is untouched");
    assert.deepEqual(state, original);
    assert.equal(correctWorkedShift(result, input), result, "no duplicate audit for unchanged assignment");
    const forged = authorizeEmployeeStateUpdate(state, result, employee.id);
    assert.deepEqual(forged.shifts, state.shifts);
    assert.deepEqual(forged.scheduleHistory, state.scheduleHistory);
  }
});

test("worked corrections reject nonmanagers, future/today shifts, drafts and incomplete input", () => {
  const { state, employee, shift, input } = fixture();
  assert.throws(() => correctWorkedShift(state, { ...input, actorId: employee.id }), /Only managers/);
  assert.throws(() => correctWorkedShift(state, { ...input, today: shift.date }), /previous day/);
  assert.throws(() => correctWorkedShift(state, { ...input, today: "2020-01-01" }), /previous day/);
  assert.throws(() => correctWorkedShift({ ...state, period: { ...state.period, status: "draft" } }, input), /published shift/);
  assert.throws(() => correctWorkedShift(state, { ...input, employeeId: "unknown" }), /Select the employee/);
  assert.throws(() => correctWorkedShift(state, { ...input, reason: " " }), /reason/);
});
