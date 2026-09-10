import type { ScheduleStatus } from "@/lib/demo-data";

const shiftChangeTypes = new Set([
  "shift_assigned",
  "shift_unassigned",
  "shift_removed",
  "shift_updated"
]);

export function shouldSuppressShiftNotification(type: string, status: ScheduleStatus) {
  return shiftChangeTypes.has(type) && status !== "published";
}
