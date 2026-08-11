import assert from "node:assert/strict";
import test from "node:test";
import type { CoverageRequest, Shift, SwapRequest } from "@/lib/demo-data";
import { createDefaultTestState } from "@/lib/test-state";
import { authorizeEmployeeStateUpdate } from "@/lib/workspace-state";

function fixture() {
  const state = createDefaultTestState();
  const employee = state.people.find((person) => person.role === "employee");
  const coworker = state.people.find((person) => person.role === "employee" && person.id !== employee?.id);
  assert(employee, "employee fixture is required");
  assert(coworker, "coworker fixture is required");

  const ownShift: Shift = {
    ...state.shifts[0],
    id: "shift_employee",
    employeeId: employee.id
  };
  const coworkerShift: Shift = {
    ...state.shifts[1],
    id: "shift_coworker",
    employeeId: coworker.id
  };
  state.shifts = [ownShift, coworkerShift, ...state.shifts.slice(2)];

  return { state, employee, coworker, ownShift, coworkerShift };
}

test("employee updates keep manager-controlled schedule fields unchanged", () => {
  const { state, employee, coworker } = fixture();
  const proposed = structuredClone(state);
  proposed.people[0].name = "Changed by employee";
  proposed.period.status = "published";
  proposed.shifts = [];
  proposed.inviteAcceptances = [
    {
      id: "fake_acceptance",
      employeeId: coworker.id,
      acceptedAt: new Date().toISOString(),
      email: coworker.email,
      name: coworker.name
    }
  ];

  const result = authorizeEmployeeStateUpdate(state, proposed, employee.id);

  assert.deepEqual(result.people, state.people);
  assert.deepEqual(result.period, state.period);
  assert.deepEqual(result.shifts, state.shifts);
  assert.deepEqual(result.inviteAcceptances, state.inviteAcceptances);
});

test("employee can save only their own availability, draft, and theme", () => {
  const { state, employee, coworker } = fixture();
  state.availability = [
    {
      id: "coworker_existing",
      schedulePeriodId: state.period.id,
      userId: coworker.id,
      submittedAt: "2026-08-10T12:00:00.000Z",
      unavailable: []
    }
  ];
  state.preferences[coworker.id] = { theme: "light" };

  const proposed = structuredClone(state);
  proposed.availability = [
    {
      id: "employee_submission",
      schedulePeriodId: state.period.id,
      userId: employee.id,
      submittedAt: "2026-08-10T13:00:00.000Z",
      unavailable: []
    },
    {
      id: "coworker_tampered",
      schedulePeriodId: state.period.id,
      userId: coworker.id,
      submittedAt: "2026-08-10T14:00:00.000Z",
      unavailable: []
    }
  ];
  proposed.availabilityDrafts = {
    [employee.id]: [
      {
        id: "own_draft",
        userId: coworker.id,
        date: state.period.startDate,
        unavailableType: "full_day",
        allDay: true
      }
    ],
    [coworker.id]: []
  };
  proposed.preferences = {
    [employee.id]: { theme: "dark" },
    [coworker.id]: { theme: "dark" }
  };

  const result = authorizeEmployeeStateUpdate(state, proposed, employee.id);

  assert.equal(result.availability.find((item) => item.userId === employee.id)?.id, "employee_submission");
  assert.equal(result.availability.find((item) => item.userId === coworker.id)?.id, "coworker_existing");
  assert.equal(result.availabilityDrafts[employee.id][0]?.userId, employee.id);
  assert.equal(result.preferences[employee.id]?.theme, "dark");
  assert.equal(result.preferences[coworker.id]?.theme, "light");
});

test("employee coverage writes allow own requests and offers but reject approvals and impersonation", () => {
  const { state, employee, coworker, ownShift, coworkerShift } = fixture();
  const openRequest: CoverageRequest = {
    id: "coverage_open",
    shiftId: coworkerShift.id,
    requestedById: coworker.id,
    status: "open",
    reason: "Coworker needs coverage."
  };
  const managerReview: CoverageRequest = {
    ...openRequest,
    id: "coverage_manager_review",
    status: "offered",
    claimedById: employee.id
  };
  state.coverage = [openRequest, managerReview];

  const proposed = structuredClone(state);
  proposed.coverage = [
    { ...openRequest, status: "offered", claimedById: employee.id },
    { ...managerReview, status: "approved", managerNote: "Self-approved" },
    {
      id: "coverage_own",
      shiftId: ownShift.id,
      requestedById: employee.id,
      status: "open",
      reason: "Need coverage."
    },
    {
      id: "coverage_impersonated",
      shiftId: coworkerShift.id,
      requestedById: coworker.id,
      status: "open",
      reason: "Fake request."
    }
  ];

  const result = authorizeEmployeeStateUpdate(state, proposed, employee.id);

  assert.equal(result.coverage.find((item) => item.id === "coverage_open")?.status, "offered");
  assert.equal(result.coverage.find((item) => item.id === "coverage_open")?.claimedById, employee.id);
  assert.equal(result.coverage.find((item) => item.id === "coverage_manager_review")?.status, "offered");
  assert(result.coverage.some((item) => item.id === "coverage_own"));
  assert(!result.coverage.some((item) => item.id === "coverage_impersonated"));
});

test("employee swap writes allow own requests and targeted responses but reject manager approval", () => {
  const { state, employee, coworker, ownShift, coworkerShift } = fixture();
  const targetedRequest: SwapRequest = {
    id: "swap_targeted",
    requesterId: coworker.id,
    targetEmployeeId: employee.id,
    requesterShiftId: coworkerShift.id,
    targetShiftId: ownShift.id,
    status: "pending_employee_response",
    reason: "Trade shifts?"
  };
  const managerReview: SwapRequest = {
    ...targetedRequest,
    id: "swap_manager_review",
    status: "pending_manager_approval"
  };
  state.swaps = [targetedRequest, managerReview];

  const proposed = structuredClone(state);
  proposed.swaps = [
    { ...targetedRequest, status: "pending_manager_approval" },
    { ...managerReview, status: "approved", managerNote: "Self-approved" },
    {
      id: "swap_own",
      requesterId: employee.id,
      targetEmployeeId: coworker.id,
      requesterShiftId: ownShift.id,
      targetShiftId: coworkerShift.id,
      status: "pending_employee_response",
      reason: "Trade shifts?"
    },
    {
      id: "swap_impersonated",
      requesterId: coworker.id,
      targetEmployeeId: employee.id,
      requesterShiftId: coworkerShift.id,
      targetShiftId: ownShift.id,
      status: "pending_employee_response",
      reason: "Fake request."
    }
  ];

  const result = authorizeEmployeeStateUpdate(state, proposed, employee.id);

  assert.equal(result.swaps.find((item) => item.id === "swap_targeted")?.status, "pending_manager_approval");
  assert.equal(result.swaps.find((item) => item.id === "swap_manager_review")?.status, "pending_manager_approval");
  assert(result.swaps.some((item) => item.id === "swap_own"));
  assert(!result.swaps.some((item) => item.id === "swap_impersonated"));
});

test("employee cannot forge another user's audit entry or resolve UAT issues", () => {
  const { state, employee, coworker } = fixture();
  state.uatIssues = [
    {
      id: "existing_issue",
      category: "ui",
      note: "Existing issue",
      status: "open",
      reportedById: coworker.id,
      role: "employee",
      activeEmployeeId: coworker.id,
      activeTab: "dashboard",
      storeName: "Men Are From Mars",
      theme: "light",
      createdAt: "2026-08-10T12:00:00.000Z"
    }
  ];

  const proposed = structuredClone(state);
  proposed.auditLog.unshift({
    id: "forged_audit",
    actorId: coworker.id,
    action: "schedule_published",
    entityType: "SchedulePeriod",
    entityId: state.period.id,
    summary: "Forged manager action",
    createdAt: new Date().toISOString()
  });
  proposed.uatIssues[0].status = "resolved";
  proposed.uatIssues.unshift({
    id: "own_issue",
    category: "mobile",
    note: "Button is hard to tap",
    status: "resolved",
    reportedById: employee.id,
    role: "manager",
    activeEmployeeId: coworker.id,
    activeTab: "dashboard",
    storeName: "Men Are From Mars",
    theme: "dark",
    createdAt: new Date().toISOString(),
    resolvedAt: new Date().toISOString()
  });

  const result = authorizeEmployeeStateUpdate(state, proposed, employee.id);

  assert(!result.auditLog.some((entry) => entry.id === "forged_audit"));
  assert.equal(result.uatIssues.find((issue) => issue.id === "existing_issue")?.status, "open");
  const ownIssue = result.uatIssues.find((issue) => issue.id === "own_issue");
  assert.equal(ownIssue?.role, "employee");
  assert.equal(ownIssue?.status, "open");
  assert.equal(ownIssue?.activeEmployeeId, employee.id);
  assert.equal(ownIssue?.resolvedAt, undefined);
});
