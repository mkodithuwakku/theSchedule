import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type SchedulePeriod,
  type AuditEntry,
  type NotificationEntry,
  employees,
  generateDefaultShifts,
  initialAuditLog,
  schedulePeriod
} from "@/lib/demo-data";
import { addIsoDays, dateInTimeZone } from "@/lib/schedule-rollout";
import { DEFAULT_UAT_RUN_ID, TEST_TODAY, type StoredTestState } from "@/lib/test-state-shared";
import { normalizeUatChecklistProgress } from "@/lib/uat-checklist";

const DATA_DIR = path.join(process.cwd(), "data");
const TEST_STATE_FILE = path.join(DATA_DIR, "test-state.json");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
}

function isMissingFile(error: unknown) {
  return errorCode(error) === "ENOENT";
}

export function isTestStateWriteUnavailable(error: unknown) {
  const code = errorCode(error);
  return (
    code === "EROFS" ||
    code === "EACCES" ||
    code === "EPERM" ||
    code === "ENOSPC"
  );
}

export function createDefaultTestState(uatRunId = DEFAULT_UAT_RUN_ID): StoredTestState {
  const defaultAuditLog: AuditEntry[] = [
    {
      ...initialAuditLog[0],
      summary: `Test run opened on ${TEST_TODAY}, before the ${schedulePeriod.releaseDate} release.`
    }
  ];

  return {
    uatRunId,
    people: clone(employees),
    period: clone(schedulePeriod),
    shifts: clone(generateDefaultShifts(schedulePeriod)),
    availability: [],
    coverage: [],
    swaps: [],
    auditLog: defaultAuditLog,
    notifications: [],
    availabilityDrafts: {},
    preferences: {},
    uatIssues: [],
    inviteAcceptances: [],
    uatChecklist: {}
  };
}

function cleanRunPeriod(now: Date): SchedulePeriod {
  const availabilityOpenAt = dateInTimeZone(now, "America/Edmonton");
  const availabilityDeadlineAt = addIsoDays(availabilityOpenAt, 5);
  const releaseDate = addIsoDays(availabilityOpenAt, 7);
  const startDate = addIsoDays(releaseDate, 1);
  const endDate = addIsoDays(startDate, 16);
  const label = (value: string) =>
    new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${value}T12:00:00.000Z`));

  return {
    id: `period_${startDate.replaceAll("-", "")}_${endDate.replaceAll("-", "")}`,
    name: `${label(startDate)} - ${label(endDate)}`,
    startDate,
    endDate,
    releaseDate,
    availabilityOpenAt,
    availabilityDeadlineAt,
    status: "draft"
  };
}

export function createCleanRunTestState(uatRunId: string, now = new Date()): StoredTestState {
  const period = cleanRunPeriod(now);
  const state = createDefaultTestState(uatRunId);
  return {
    ...state,
    period,
    shifts: generateDefaultShifts(period),
    auditLog: [
      {
        id: `audit_clean_${uatRunId}`,
        actorId: "emp_manager",
        action: "uat_run_created",
        entityType: "SchedulePeriod",
        entityId: period.id,
        summary: `Clean production UAT run opened for ${period.name}.`,
        createdAt: now.toISOString()
      }
    ]
  };
}

export function normalizeTestState(candidate: Partial<StoredTestState>): StoredTestState {
  const defaults = createDefaultTestState();

  return {
    uatRunId: typeof candidate.uatRunId === "string" && candidate.uatRunId.trim() ? candidate.uatRunId : defaults.uatRunId,
    people: Array.isArray(candidate.people) ? candidate.people : defaults.people,
    period: candidate.period ?? defaults.period,
    shifts: Array.isArray(candidate.shifts) ? candidate.shifts : defaults.shifts,
    availability: Array.isArray(candidate.availability) ? candidate.availability : defaults.availability,
    coverage: Array.isArray(candidate.coverage) ? candidate.coverage : defaults.coverage,
    swaps: Array.isArray(candidate.swaps) ? candidate.swaps : defaults.swaps,
    auditLog: Array.isArray(candidate.auditLog) ? candidate.auditLog : defaults.auditLog,
    notifications: Array.isArray(candidate.notifications) ? candidate.notifications : defaults.notifications,
    availabilityDrafts: candidate.availabilityDrafts ?? defaults.availabilityDrafts,
    preferences: candidate.preferences ?? defaults.preferences,
    uatIssues: Array.isArray(candidate.uatIssues) ? candidate.uatIssues : defaults.uatIssues,
    inviteAcceptances: Array.isArray(candidate.inviteAcceptances) ? candidate.inviteAcceptances : defaults.inviteAcceptances,
    uatChecklist: normalizeUatChecklistProgress(candidate.uatChecklist)
  };
}

export async function readTestState() {
  try {
    const rawState = await readFile(TEST_STATE_FILE, "utf8");
    return normalizeTestState(JSON.parse(rawState) as Partial<StoredTestState>);
  } catch (error) {
    if (isMissingFile(error)) return createDefaultTestState();
    throw error;
  }
}

export async function writeTestState(state: Partial<StoredTestState>) {
  const normalized = normalizeTestState(state);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(TEST_STATE_FILE, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function resetTestState() {
  return writeTestState(createDefaultTestState());
}

export async function appendTestNotification(notification: NotificationEntry) {
  const state = await readTestState();
  const nextState: StoredTestState = {
    ...state,
    notifications: [notification, ...state.notifications]
  };

  try {
    await writeTestState(nextState);
  } catch (error) {
    if (!isTestStateWriteUnavailable(error)) throw error;
  }

  return nextState;
}
