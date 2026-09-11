import assert from "node:assert/strict";
import test from "node:test";
import { generateDefaultShifts, isEmployeeUnavailable } from "@/lib/demo-data";
import { correctSecondHalfDraft } from "@/lib/schedule-period-correction";
import { createCleanRunTestState } from "@/lib/test-state";
import { assertWorkspaceRevision, authorizeEmployeeStateUpdate, filterEmployeeWorkspace, WorkspaceConflictError } from "@/lib/workspace-state";

function legacySeptember() {
  const state = createCleanRunTestState("live_run", new Date("2026-09-08T18:00:00Z"));
  state.workspaceVersion = 501;
  state.period = { ...state.period, id: "period_20260915_20260930", startDate: "2026-09-15",
    name: "September 15, 2026 - September 30, 2026", releaseDate: "2026-09-15",
    availabilityOpenAt: "2026-09-07", availabilityDeadlineAt: "2026-09-13" };
  state.people.push({ id: "invited_employee", name: "Invited Employee", email: "employee@example.com", role: "employee", active: true });
  state.inviteAcceptances = [{ id: "invite_accepted", employeeId: "invited_employee", email: "employee@example.com", name: "Invited Employee", acceptedAt: "2026-09-09T18:00:00Z" }];
  state.availability = [
    { id: "submitted", schedulePeriodId: state.period.id, userId: "invited_employee", submittedAt: "2026-09-10T18:00:00Z", unavailable: [
      { id: "day15", userId: "invited_employee", date: "2026-09-15", unavailableType: "full_day", allDay: true },
      { id: "day18", userId: "invited_employee", date: "2026-09-18", unavailableType: "full_day", allDay: true }
    ] },
    { id: "no_unavailable_days", schedulePeriodId: state.period.id, userId: "emp_manager", submittedAt: "2026-09-10T18:00:00Z", unavailable: [] }
  ];
  state.availabilityDrafts = { invited_employee: structuredClone(state.availability[0].unavailable) };
  state.shifts = generateDefaultShifts(state.period).map((shift) => ({ ...shift, employeeId: "emp_manager", notes: "Keep this assignment and edited time", endTime: "16:00" }));
  return state;
}

test("September correction preserves submissions, IDs, invitations, deadlines and all remaining shift edits", () => {
  const before = legacySeptember();
  const original = structuredClone(before);
  const after = correctSecondHalfDraft(before);
  assert.deepEqual(before, original, "the input must never be mutated");
  assert.equal(after.period.startDate, "2026-09-16");
  assert.equal(after.period.name, "September 16, 2026 - September 30, 2026");
  assert.deepEqual(after.period, { ...before.period, startDate: after.period.startDate, name: after.period.name });
  for (const key of Object.keys(before) as Array<keyof typeof before>) {
    if (!["period", "shifts", "auditLog"].includes(key)) assert.deepEqual(after[key], before[key], `${key} must be preserved`);
  }
  assert.deepEqual(after.shifts, before.shifts.filter((shift) => shift.date !== "2026-09-15"));
  assert.deepEqual(after.auditLog.slice(1), before.auditLog);
  assert.equal(correctSecondHalfDraft(after), after, "re-running must be a no-op");
  assert(generateDefaultShifts(after.period).every((shift) => shift.date >= "2026-09-16" && shift.date <= "2026-09-30"));
  assert(isEmployeeUnavailable("invited_employee", after.shifts.find((shift) => shift.date === "2026-09-18")!, after.availability));

  const view = filterEmployeeWorkspace(after, "invited_employee");
  assert.equal(view.availability[0].submittedAt, before.availability[0].submittedAt);
  const saved = authorizeEmployeeStateUpdate(after, view, "invited_employee");
  assert.deepEqual(saved.availability.find((entry) => entry.id === "submitted"), before.availability[0]);
  assert.deepEqual(saved.availability.find((entry) => entry.id === "no_unavailable_days"), before.availability[1]);
  assert.throws(() => assertWorkspaceRevision({ ...after, workspaceVersion: 502 }, before), WorkspaceConflictError);
});

test("repair leaves published schedules, history, and already-correct periods alone", () => {
  const state = legacySeptember();
  for (const status of ["published", "archived"] as const) {
    const published = { ...state, period: { ...state.period, status } };
    assert.equal(correctSecondHalfDraft(published), published);
  }
  state.scheduleHistory = [{ id: "history", archivedAt: "2026-09-01", period: { ...state.period, status: "published" }, shifts: state.shifts }];
  assert.deepEqual(correctSecondHalfDraft(state).scheduleHistory, state.scheduleHistory);
  const corrected = createCleanRunTestState("new", new Date("2026-09-08T18:00:00Z"));
  assert.equal(correctSecondHalfDraft(corrected), corrected);
});

test("repair refuses custom period ranges or orphaning shift requests", () => {
  const state = legacySeptember();
  assert.throws(() => correctSecondHalfDraft({ ...state, period: { ...state.period, endDate: "2026-09-29" } }), /last day/);
  state.coverage = [{ id: "request", shiftId: state.shifts[0].id, requestedById: "emp_manager", status: "open", reason: "Review" }];
  assert.throws(() => correctSecondHalfDraft(state), /shift requests/);
});
