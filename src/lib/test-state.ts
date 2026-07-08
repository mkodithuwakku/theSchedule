import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type AuditEntry,
  type NotificationEntry,
  employees,
  initialAuditLog,
  schedulePeriod
} from "@/lib/demo-data";
import { TEST_TODAY, type StoredTestState } from "@/lib/test-state-shared";

const DATA_DIR = path.join(process.cwd(), "data");
const TEST_STATE_FILE = path.join(DATA_DIR, "test-state.json");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isMissingFile(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

export function createDefaultTestState(): StoredTestState {
  const defaultAuditLog: AuditEntry[] = [
    {
      ...initialAuditLog[0],
      summary: `Test run opened on ${TEST_TODAY}, before the ${schedulePeriod.releaseDate} release.`
    }
  ];

  return {
    people: clone(employees),
    period: clone(schedulePeriod),
    shifts: [],
    availability: [],
    coverage: [],
    swaps: [],
    auditLog: defaultAuditLog,
    notifications: [],
    availabilityDrafts: {},
    preferences: {},
    uatIssues: [],
    inviteAcceptances: []
  };
}

function normalizeTestState(candidate: Partial<StoredTestState>): StoredTestState {
  const defaults = createDefaultTestState();

  return {
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
    inviteAcceptances: Array.isArray(candidate.inviteAcceptances) ? candidate.inviteAcceptances : defaults.inviteAcceptances
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

  await writeTestState(nextState);
  return nextState;
}
