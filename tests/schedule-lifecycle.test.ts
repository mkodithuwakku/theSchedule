import assert from "node:assert/strict";
import test from "node:test";
import { createCleanRunTestState, createDefaultTestState } from "@/lib/test-state";
import { openDueScheduleCycle, publishedScheduleWindows, assignWorkspaceShifts, allWorkspaceShifts } from "@/lib/schedule-progression";
import { authorizeEmployeeStateUpdate, filterEmployeeWorkspace } from "@/lib/workspace-state";
import { availabilityReminderDate, buildPublishedSchedulePlans, isAvailabilityReminderDue } from "@/lib/schedule-rollout";

function september() {
  const state = createDefaultTestState("september_live");
  state.period.status = "published";
  state.workspaceVersion = 10;
  state.shifts = state.shifts.map((shift, index) => ({ ...shift, employeeId: state.people[index % state.people.length].id }));
  state.availability = state.people.map((person) => ({ id: `sept_${person.id}`, schedulePeriodId: state.period.id, userId: person.id, submittedAt: "2026-09-08", unavailable: [] }));
  state.coverage = [{ id: "sept_cover", shiftId: state.shifts[1].id, requestedById: state.people[1].id, status: "open", reason: "September coverage" }];
  return state;
}
const noon = (day: string) => new Date(`${day}T18:00:00Z`);

test("September 8 clean reset selects September 15 instead of skipping to October", () => {
  const state = createCleanRunTestState("launch", noon("2026-09-08"));
  assert.equal(state.period.startDate, "2026-09-15");
  assert.equal(state.period.endDate, "2026-09-30");
  assert.equal(state.period.availabilityOpenAt, "2026-09-08");
  assert.deepEqual(state.shifts, []);
  assert.equal(state.people.length, 1);
});

test("October window opens September 23 on the real clock without losing September workflows", () => {
  const original = september();
  const copy = structuredClone(original);
  assert.equal(openDueScheduleCycle(original, noon("2026-09-22")), original);
  const october = openDueScheduleCycle(original, noon("2026-09-23"));
  assert.deepEqual(original, copy);
  assert.equal(october.period.startDate, "2026-10-01");
  assert.equal(october.period.endDate, "2026-10-14");
  assert.equal(october.period.availabilityOpenAt, "2026-09-23");
  assert.equal(availabilityReminderDate(october.period.releaseDate), "2026-09-27");
  assert.equal(october.period.availabilityDeadlineAt, "2026-09-28");
  assert.equal(october.period.releaseDate, "2026-09-30");
  assert.equal(october.dayProgression.enabled, false);
  assert.deepEqual(october.scheduleHistory[0].shifts, original.shifts);
  assert.deepEqual(october.coverage, original.coverage);
  assert.deepEqual(october.availability, original.availability);
  assert.equal(october.availability.filter((a) => a.schedulePeriodId === october.period.id).length, 0);
  assert.deepEqual(october.availabilityDrafts, {});
  assert(october.shifts.length > 0 && october.shifts.every((s) => !s.employeeId && s.schedulePeriodId === october.period.id));
  assert.equal(openDueScheduleCycle(october, noon("2026-09-23")), october, "repeat cron must not recreate the draft");
  assert.equal(openDueScheduleCycle(october, noon("2026-10-08")), october, "unfinished October draft must not be discarded");
  assert.equal(openDueScheduleCycle({ ...original, dayProgression: { ...original.dayProgression, enabled: true } }, noon("2026-09-23")).period.id, original.period.id);
});

test("employees retain September shifts and coverage while submitting fresh October availability", () => {
  const original = september();
  const october = openDueScheduleCycle(original, noon("2026-09-23"));
  const employee = original.people[1];
  const view = filterEmployeeWorkspace(october, employee.id);
  assert.deepEqual(view.shifts, [], "October draft must remain private");
  assert.equal(publishedScheduleWindows(view)[0].period.id, original.period.id);
  assert(allWorkspaceShifts(view).some((shift) => shift.employeeId === employee.id));
  view.availability.push({ id: "oct_availability", userId: employee.id, schedulePeriodId: october.period.id, submittedAt: "2026-09-23", unavailable: [] });
  view.coverage.push({ id: "new_sept_cover", shiftId: original.shifts[5].id, requestedById: employee.id, status: "open", reason: "Still a September shift" });
  const saved = authorizeEmployeeStateUpdate(october, view, employee.id);
  assert(saved.availability.some((a) => a.userId === employee.id && a.schedulePeriodId === original.period.id));
  assert(saved.availability.some((a) => a.userId === employee.id && a.schedulePeriodId === october.period.id));
  assert(saved.coverage.some((c) => c.id === "new_sept_cover"));
  const changed = assignWorkspaceShifts(saved, { [original.shifts[5].id]: original.people[2].id });
  assert.equal(changed.scheduleHistory[0].shifts[5].employeeId, original.people[2].id);
  assert.deepEqual(changed.shifts, october.shifts, "approving September coverage must not modify October's draft");
});

test("October publication has distinct emails and the following window opens October 7", () => {
  const original = september();
  const october = openDueScheduleCycle(original, noon("2026-09-23"));
  october.period.status = "published";
  const members = original.people.map((person) => ({ userId: person.id, name: person.name, email: person.email, active: true }));
  const plans = (state: typeof original) => buildPublishedSchedulePlans({ storeId: "store_wem", timeZone: "America/Edmonton", state, members, appUrl: "https://mafm-schedule.vercel.app" });
  const septemberKeys = new Set(plans(original).map((p) => p.dedupKey));
  assert(plans(october).every((p) => !septemberKeys.has(p.dedupKey)));
  assert.equal(publishedScheduleWindows(october).length, 2);
  assert.equal(openDueScheduleCycle(october, noon("2026-10-06")), october);
  const next = openDueScheduleCycle(october, noon("2026-10-07"));
  assert.equal(next.period.startDate, "2026-10-15");
  assert.equal(next.period.endDate, "2026-10-31");
  assert.equal(next.dayProgression.enabled, false);
  assert.equal(publishedScheduleWindows(next).length, 2);
});

test("a delayed cron catches up the window and reminders through the availability deadline", () => {
  const october = openDueScheduleCycle(september(), noon("2026-09-27"));
  assert.equal(october.period.startDate, "2026-10-01");
  assert.equal(isAvailabilityReminderDue(october.period, noon("2026-09-26"), "America/Edmonton"), false);
  assert.equal(isAvailabilityReminderDue(october.period, noon("2026-09-27"), "America/Edmonton"), true);
  assert.equal(isAvailabilityReminderDue(october.period, noon("2026-09-28"), "America/Edmonton"), true);
  assert.equal(isAvailabilityReminderDue(october.period, noon("2026-09-29"), "America/Edmonton"), false);
});
