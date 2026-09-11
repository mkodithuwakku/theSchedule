import { periodLabel } from "@/lib/schedule-progression";
import type { StoredTestState } from "@/lib/test-state-shared";

/** Explicit, one-time repair of an unpublished legacy second-half draft. */
export function correctSecondHalfDraft(state: StoredTestState, now = new Date()): StoredTestState {
  const { period } = state;
  if (period.status !== "draft" || period.startDate.slice(-2) !== "15") return state;
  const [year, month] = period.startDate.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  if (period.endDate !== monthEnd) throw new Error("Expected a second-half draft ending on the last day of its month.");

  const removedShifts = state.shifts.filter((shift) => shift.date === period.startDate);
  const removedIds = new Set(removedShifts.map((shift) => shift.id));
  if (state.coverage.some((request) => removedIds.has(request.shiftId)) ||
    state.swaps.some((request) => removedIds.has(request.requesterShiftId) || removedIds.has(request.targetShiftId ?? ""))) {
    throw new Error("The 15th has shift requests; review them before correcting this draft.");
  }

  const startDate = `${period.startDate.slice(0, 8)}16`;
  return {
    ...state,
    // The ID and collection/release dates are already used by submissions and emails.
    period: { ...period, startDate, name: periodLabel(startDate, period.endDate) },
    shifts: state.shifts.filter((shift) => !removedIds.has(shift.id)),
    auditLog: [{
      id: `audit_period_boundary_${period.id}`,
      actorId: "system",
      action: "schedule_period_boundary_corrected",
      entityType: "SchedulePeriod",
      entityId: period.id,
      summary: `Corrected draft start from ${period.startDate} to ${startDate}. Removed ${removedShifts.length} draft shifts on the 15th, retained in the pre-correction backup. Availability, invitations, remaining shifts, and collection/release dates are preserved.`,
      createdAt: now.toISOString()
    }, ...state.auditLog]
  };
}
