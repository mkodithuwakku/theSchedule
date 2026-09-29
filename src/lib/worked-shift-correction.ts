import { publishedScheduleWindows } from "@/lib/schedule-progression";
import { isPendingCoverage } from "@/lib/coverage-policy";
import type { StoredTestState } from "@/lib/test-state-shared";

type CorrectionState = Pick<StoredTestState, "period" | "shifts" | "scheduleHistory" | "people" | "coverage" | "swaps" | "auditLog">;

/** Record actual work without applying future-scheduling availability rules. */
export function correctWorkedShift<T extends CorrectionState>(
  state: T,
  input: { shiftId: string; employeeId: string; actorId: string; reason: string; today: string; now: string; auditId: string }
): T {
  const actor = state.people.find((person) => person.id === input.actorId);
  if (!actor?.active || actor.role !== "manager") throw new Error("Only managers can correct worked shifts.");
  const shift = publishedScheduleWindows(state).flatMap((window) => window.shifts).find((item) => item.id === input.shiftId);
  if (!shift || shift.date >= input.today) throw new Error("Select a published shift from a previous day.");
  const employee = state.people.find((person) => person.id === input.employeeId);
  if (!employee) throw new Error("Select the employee who worked this shift.");
  if (!input.reason.trim()) throw new Error("Enter a reason for the correction.");
  if (shift.employeeId === employee.id && !shift.externalAssigneeName) return state;
  const previousName = state.people.find((person) => person.id === shift.employeeId)?.name ?? shift.externalAssigneeName ?? "Unassigned";
  const update = (item: typeof shift) => item.id === shift.id
    ? { ...item, employeeId: employee.id, externalAssigneeName: undefined } : item;
  return {
    ...state,
    shifts: state.shifts.map(update),
    scheduleHistory: state.scheduleHistory.map((entry) => ({ ...entry, shifts: entry.shifts.map(update) })),
    coverage: state.coverage.map((request) => request.shiftId === shift.id && isPendingCoverage(request)
      ? { ...request, status: "cancelled", managerNote: "Closed after manager corrected the worked shift." } : request),
    swaps: state.swaps.map((request) => (request.requesterShiftId === shift.id || request.targetShiftId === shift.id) &&
      (request.status === "pending_employee_response" || request.status === "pending_manager_approval")
      ? { ...request, status: "cancelled", managerNote: "Closed after manager corrected the worked shift." } : request),
    auditLog: [{
      id: input.auditId, actorId: input.actorId, action: "worked_shift_corrected", entityType: "Shift", entityId: shift.id,
      summary: `${shift.date} ${shift.startTime}-${shift.endTime}: changed worked employee from ${previousName} to ${employee.name}. Reason: ${input.reason.trim()}`,
      createdAt: input.now
    }, ...state.auditLog]
  };
}
