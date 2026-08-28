import type { AvailabilitySubmission, Employee, Shift } from "@/lib/demo-data";
import { isEmployeeUnavailable, shiftDurationHours, toMinutes } from "@/lib/demo-data";

export type ScheduleBlockingIssueCode =
  | "unfilled_shift"
  | "duplicate_employee_day"
  | "availability_conflict"
  | "invalid_time_range";

export type ScheduleBlockingIssue = {
  code: ScheduleBlockingIssueCode;
  shiftId: string;
  message: string;
};

export function isShiftFilled(shift: Pick<Shift, "employeeId" | "externalAssigneeName">) {
  return Boolean(shift.employeeId || shift.externalAssigneeName?.trim());
}

export function isEmployeeAssignedOnDate(
  shifts: Shift[],
  employeeId: string,
  date: string,
  excludingShiftId?: string
) {
  return shifts.some(
    (shift) =>
      shift.id !== excludingShiftId &&
      shift.date === date &&
      shift.employeeId === employeeId
  );
}

export function autoAssignDraftShifts(
  generated: Shift[],
  people: Employee[],
  availability: AvailabilitySubmission[],
  random = Math.random
) {
  const totals = new Map(people.map((employee) => [employee.id, { shifts: 0, hours: 0 }]));
  const assignedDates = new Set<string>();

  generated.forEach((shift) => {
    if (!shift.employeeId || !totals.has(shift.employeeId)) return;
    const current = totals.get(shift.employeeId) ?? { shifts: 0, hours: 0 };
    totals.set(shift.employeeId, {
      shifts: current.shifts + 1,
      hours: current.hours + shiftDurationHours(shift)
    });
    assignedDates.add(`${shift.employeeId}:${shift.date}`);
  });

  return generated.map((shift) => {
    if (isShiftFilled(shift)) return shift;

    const candidates = people
      .filter(
        (employee) =>
          employee.active &&
          !assignedDates.has(`${employee.id}:${shift.date}`) &&
          !isEmployeeUnavailable(employee.id, shift, availability)
      )
      .map((employee) => {
        const total = totals.get(employee.id) ?? { shifts: 0, hours: 0 };
        return {
          employee,
          shifts: total.shifts,
          hours: total.hours,
          tieBreaker: random()
        };
      })
      .sort((a, b) => a.shifts - b.shifts || a.hours - b.hours || a.tieBreaker - b.tieBreaker);

    const selected = candidates[0]?.employee;
    if (!selected) return shift;

    const current = totals.get(selected.id) ?? { shifts: 0, hours: 0 };
    totals.set(selected.id, {
      shifts: current.shifts + 1,
      hours: current.hours + shiftDurationHours(shift)
    });
    assignedDates.add(`${selected.id}:${shift.date}`);

    return {
      ...shift,
      employeeId: selected.id
    };
  });
}

export function getScheduleBlockingIssues(
  shifts: Shift[],
  availability: AvailabilitySubmission[],
  people: Employee[] = []
) {
  const issues: ScheduleBlockingIssue[] = [];
  const personNameById = new Map(people.map((person) => [person.id, person.name]));
  const employeeDateAssignments = new Map<string, Shift[]>();

  shifts.forEach((shift) => {
    if (!isShiftFilled(shift)) {
      issues.push({
        code: "unfilled_shift",
        shiftId: shift.id,
        message: `${shift.date} ${shift.startTime}-${shift.endTime} has no available employee. Open this slot and enter manual cover.`
      });
    }

    if (toMinutes(shift.endTime) <= toMinutes(shift.startTime)) {
      issues.push({
        code: "invalid_time_range",
        shiftId: shift.id,
        message: `${shift.date} has a shift whose end time is not later than its start time.`
      });
    }

    if (!shift.employeeId) return;

    if (isEmployeeUnavailable(shift.employeeId, shift, availability)) {
      const name = personNameById.get(shift.employeeId) ?? "An employee";
      issues.push({
        code: "availability_conflict",
        shiftId: shift.id,
        message: `${name} is unavailable for the ${shift.date} ${shift.startTime}-${shift.endTime} shift.`
      });
    }

    const key = `${shift.employeeId}:${shift.date}`;
    employeeDateAssignments.set(key, [...(employeeDateAssignments.get(key) ?? []), shift]);
  });

  employeeDateAssignments.forEach((assignedShifts) => {
    if (assignedShifts.length < 2) return;
    const employeeId = assignedShifts[0]?.employeeId;
    const name = employeeId ? personNameById.get(employeeId) ?? "An employee" : "An employee";
    assignedShifts.forEach((shift) => {
      issues.push({
        code: "duplicate_employee_day",
        shiftId: shift.id,
        message: `${name} is assigned more than once on ${shift.date}. Each employee can work only one shift per day.`
      });
    });
  });

  return issues;
}
