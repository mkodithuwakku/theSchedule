import type {
  AuditEntry,
  AvailabilitySubmission,
  CoverageRequest,
  Employee,
  NotificationEntry,
  SchedulePeriod,
  Shift,
  SwapRequest,
  Unavailability
} from "@/lib/demo-data";

export const TEST_TODAY = "July 6, 2026";
export const STORAGE_KEY = "the-schedule-test-state-v1";

export type StoredTestState = {
  people: Employee[];
  period: SchedulePeriod;
  shifts: Shift[];
  availability: AvailabilitySubmission[];
  coverage: CoverageRequest[];
  swaps: SwapRequest[];
  auditLog: AuditEntry[];
  notifications: NotificationEntry[];
  availabilityDrafts: Record<string, Unavailability[]>;
};
