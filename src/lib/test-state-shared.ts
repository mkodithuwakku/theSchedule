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
import type { UatCheckStatus } from "@/lib/uat-checklist";

export const TEST_TODAY = "July 6, 2026";
export const STORAGE_KEY = "the-schedule-test-state-v1";
export const DEFAULT_UAT_RUN_ID = "uat_initial";

export type ThemePreference = "light" | "dark";

export type UserPreference = {
  theme: ThemePreference;
};

export type UatIssueStatus = "open" | "resolved";
export type UatIssueCategory =
  | "ui"
  | "calendar"
  | "availability"
  | "schedule_builder"
  | "notifications"
  | "employee_invite"
  | "mobile"
  | "other";

export type UatIssue = {
  id: string;
  category: UatIssueCategory;
  note: string;
  status: UatIssueStatus;
  reportedById?: string;
  role: "manager" | "employee";
  activeEmployeeId?: string;
  activeTab: string;
  storeName: string;
  theme: ThemePreference;
  createdAt: string;
  resolvedAt?: string;
};

export type InviteAcceptance = {
  id: string;
  employeeId: string;
  acceptedAt: string;
  email: string;
  name: string;
};

export type DayProgressionState = {
  enabled: boolean;
  currentDate: string;
  cycleNumber: number;
};

export type ArchivedSchedule = {
  id: string;
  archivedAt: string;
  period: SchedulePeriod;
  shifts: Shift[];
};

export type StoredTestState = {
  uatRunId: string;
  people: Employee[];
  period: SchedulePeriod;
  shifts: Shift[];
  availability: AvailabilitySubmission[];
  coverage: CoverageRequest[];
  swaps: SwapRequest[];
  auditLog: AuditEntry[];
  notifications: NotificationEntry[];
  availabilityDrafts: Record<string, Unavailability[]>;
  preferences: Record<string, UserPreference>;
  uatIssues: UatIssue[];
  inviteAcceptances: InviteAcceptance[];
  uatChecklist: Record<string, UatCheckStatus>;
  dayProgression: DayProgressionState;
  scheduleHistory: ArchivedSchedule[];
};
