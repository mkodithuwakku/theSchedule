import assert from "node:assert/strict";
import test from "node:test";
import type { AvailabilitySubmission, Employee, Shift } from "../src/lib/demo-data";
import {
  autoAssignDraftShifts,
  getScheduleBlockingIssues,
  isEmployeeAssignedOnDate,
  isShiftFilled
} from "../src/lib/schedule-builder";

const people: Employee[] = [
  { id: "employee-a", name: "Alex", email: "alex@example.com", role: "employee", active: true },
  { id: "employee-b", name: "Blair", email: "blair@example.com", role: "employee", active: true }
];

function shift(id: string, date: string, startTime: string, endTime: string): Shift {
  return {
    id,
    schedulePeriodId: "period-1",
    date,
    startTime,
    endTime
  };
}

test("auto assignment never schedules an employee twice on the same day", () => {
  const generated = autoAssignDraftShifts(
    [
      shift("opening", "2026-08-30", "09:00", "13:00"),
      shift("middle", "2026-08-30", "13:00", "17:00"),
      shift("closing", "2026-08-30", "17:00", "21:00")
    ],
    people,
    [],
    () => 0
  );

  assert.equal(generated[0]?.employeeId, "employee-a");
  assert.equal(generated[1]?.employeeId, "employee-b");
  assert.equal(generated[2]?.employeeId, undefined);
  assert.equal(isShiftFilled(generated[2]!), false);
});

test("auto assignment leaves a manual-cover error when available employees are already working", () => {
  const availability: AvailabilitySubmission[] = [
    {
      id: "availability-b",
      schedulePeriodId: "period-1",
      userId: "employee-b",
      submittedAt: "2026-08-20T12:00:00.000Z",
      unavailable: [
        {
          id: "unavailable-b",
          userId: "employee-b",
          date: "2026-08-30",
          unavailableType: "full_day",
          allDay: true
        }
      ]
    }
  ];

  const generated = autoAssignDraftShifts(
    [
      shift("opening", "2026-08-30", "09:00", "13:00"),
      shift("closing", "2026-08-30", "13:00", "17:00")
    ],
    people,
    availability,
    () => 0
  );

  assert.equal(generated[0]?.employeeId, "employee-a");
  assert.equal(generated[1]?.employeeId, undefined);
  assert.equal(
    getScheduleBlockingIssues(generated, availability, people).some(
      (issue) => issue.code === "unfilled_shift" && issue.shiftId === "closing"
    ),
    true
  );
});

test("the same employee may be assigned again on a different date", () => {
  const generated = autoAssignDraftShifts(
    [
      shift("sunday", "2026-08-30", "09:00", "17:00"),
      shift("monday", "2026-08-31", "09:00", "17:00")
    ],
    [people[0]!],
    [],
    () => 0
  );

  assert.deepEqual(
    generated.map((item) => item.employeeId),
    ["employee-a", "employee-a"]
  );
  assert.equal(isEmployeeAssignedOnDate(generated, "employee-a", "2026-08-30", "sunday"), false);
  assert.equal(isEmployeeAssignedOnDate(generated, "employee-a", "2026-08-31", "sunday"), true);
});

test("manual cover resolves an unfilled slot while duplicate employee assignments block publishing", () => {
  const duplicateShifts = [
    { ...shift("opening", "2026-08-30", "09:00", "13:00"), employeeId: "employee-a" },
    { ...shift("closing", "2026-08-30", "13:00", "17:00"), employeeId: "employee-a" },
    shift("unfilled", "2026-08-31", "09:00", "17:00")
  ];
  const issues = getScheduleBlockingIssues(duplicateShifts, [], people);

  assert.equal(issues.filter((issue) => issue.code === "duplicate_employee_day").length, 2);
  assert.equal(issues.filter((issue) => issue.code === "unfilled_shift").length, 1);

  const resolved = duplicateShifts.map((item) =>
    item.id === "unfilled" ? { ...item, externalAssigneeName: "Manual Cover" } : item
  );
  assert.equal(
    getScheduleBlockingIssues(resolved, [], people).some((issue) => issue.code === "unfilled_shift"),
    false
  );
});
