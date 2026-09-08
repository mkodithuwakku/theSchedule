import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultTestState } from "@/lib/test-state";
import { authorizeEmployeeStateUpdate, filterEmployeeWorkspace } from "@/lib/workspace-state";

test("employee responses contain own availability and published team shifts, but no private coworker or manager records", () => {
  const state = { ...createDefaultTestState("privacy"), workspaceVersion: 4 };
  const employee = state.people[1];
  const coworker = state.people[2];
  state.period.status = "published";
  state.shifts[0].employeeId = coworker.id;
  state.shifts[0].notes = "PRIVATE_MANAGER_SHIFT_NOTE";
  state.availability = [employee, coworker].map((person) => ({
    id: person.id, userId: person.id, schedulePeriodId: state.period.id,
    note: person.id === employee.id ? "MY_AVAILABILITY" : "PRIVATE_COWORKER_AVAILABILITY", unavailable: []
  }));
  state.availabilityDrafts = {
    [employee.id]: [{ id: "mine", userId: employee.id, date: state.period.startDate, allDay: true, unavailableType: "full_day", note: "MY_DRAFT" }],
    [coworker.id]: [{ id: "theirs", userId: coworker.id, date: state.period.startDate, allDay: true, unavailableType: "full_day", note: "PRIVATE_COWORKER_DRAFT" }]
  };
  state.preferences = { [employee.id]: { theme: "dark" }, [coworker.id]: { theme: "light" } };
  state.auditLog[0].summary = "PRIVATE_MANAGER_AUDIT";
  state.notifications = [
    { id: "my_mail", userId: employee.id, subject: "MY_NOTIFICATION", type: "shift", status: "sent", createdAt: "now" },
    { id: "other_mail", userId: coworker.id, subject: "PRIVATE_NOTIFICATION", type: "shift", status: "sent", createdAt: "now" }
  ];
  state.uatIssues = [{ id: "issue", note: "PRIVATE_ISSUE", category: "other", status: "open", role: "manager", activeTab: "settings", storeName: "store", theme: "light", createdAt: "now" }];
  state.inviteAcceptances = [{ id: "invite", employeeId: coworker.id, email: coworker.email, name: coworker.name, acceptedAt: "now" }];
  state.uatChecklist = { "auth-manager-first-login": "passed" };
  state.coverage = [{ id: "cover", requestedById: coworker.id, shiftId: state.shifts[0].id, status: "open", reason: "PRIVATE_COVERAGE_REASON", managerNote: "PRIVATE_DECISION" }];
  state.swaps = [{ id: "unrelated", requesterId: coworker.id, targetEmployeeId: state.people[3].id, requesterShiftId: "shift", status: "pending_employee_response", reason: "PRIVATE_SWAP" }];
  state.scheduleHistory = [{ id: "history", archivedAt: "now", period: { ...state.period }, shifts: structuredClone(state.shifts) }];
  const before = structuredClone(state);
  const response = filterEmployeeWorkspace(state, employee.id);
  const json = JSON.stringify(response);
  assert(!json.includes("PRIVATE_"));
  assert(!json.includes(coworker.email));
  assert(json.includes(employee.email));
  assert(json.includes("MY_AVAILABILITY"));
  assert(json.includes("MY_DRAFT"));
  assert(json.includes("MY_NOTIFICATION"));
  assert.equal(response.shifts[0].employeeId, coworker.id);
  assert.equal(response.people.find((p) => p.id === coworker.id)?.name, coworker.name);
  assert.deepEqual(Object.keys(response.preferences), [employee.id]);
  assert.equal(response.workspaceVersion, 4);
  assert.deepEqual(state, before, "filtering must not mutate the persisted manager state");

  // A redacted open request must still be claimable without revealing its reason.
  response.coverage[0].status = "offered";
  response.coverage[0].claimedById = employee.id;
  const saved = authorizeEmployeeStateUpdate(state, response, employee.id);
  assert.equal(saved.coverage[0].status, "offered");
  assert.equal(saved.coverage[0].reason, "PRIVATE_COVERAGE_REASON");
  assert.deepEqual(saved.availabilityDrafts[coworker.id], state.availabilityDrafts[coworker.id]);
  assert.deepEqual(saved.auditLog, state.auditLog);
  assert(!JSON.stringify(filterEmployeeWorkspace(saved, employee.id)).includes("PRIVATE_"));
});

test("unpublished shifts never reach employee browsers, including an empty blank slate", () => {
  const state = createDefaultTestState();
  assert(state.shifts.length > 0);
  assert.deepEqual(filterEmployeeWorkspace(state, state.people[1].id).shifts, []);
  state.shifts = [];
  assert.deepEqual(filterEmployeeWorkspace(state, state.people[1].id).shifts, []);
});
