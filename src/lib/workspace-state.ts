import { allWorkspaceShifts } from "@/lib/schedule-progression";
import { randomUUID } from "node:crypto";
import type { AuditEntry, NotificationEntry, SwapRequest } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";
import { createCleanRunTestState, normalizeTestState } from "@/lib/test-state";
import type { StoredTestState, UatIssue } from "@/lib/test-state-shared";
import { overwriteWorkspaceBackup, protectWorkspaceAfterSave } from "@/lib/workspace-backup";

function jsonValue<T>(value: T) {
  return JSON.parse(JSON.stringify(value));
}

export class StaleUatRunError extends Error {
  constructor() {
    super("This browser belongs to an older UAT run. Refresh before saving.");
    this.name = "StaleUatRunError";
  }
}

export class WorkspaceConflictError extends Error {
  constructor() {
    super("The schedule changed in another session. Your changes were not saved. Reload the latest schedule before editing again.");
    this.name = "WorkspaceConflictError";
  }
}

export function assertWorkspaceRevision(existing: StoredTestState, proposed: Partial<StoredTestState>) {
  if (proposed.uatRunId !== existing.uatRunId) throw new StaleUatRunError();
  if (!Number.isSafeInteger(proposed.workspaceVersion) || proposed.workspaceVersion !== existing.workspaceVersion) {
    throw new WorkspaceConflictError();
  }
}

export async function readWorkspaceState(storeId: string): Promise<StoredTestState> {
  // Upsert creates only an empty owner workspace; it never reintroduces demo employees.
  const record = await prisma.storeWorkspaceState.upsert({
    where: { storeId },
    update: {},
    create: { storeId, data: jsonValue(createCleanRunTestState(`uat_${randomUUID()}`)) }
  });
  const raw = record.data as Partial<StoredTestState>;
  if (!raw.uatRunId) {
    await prisma.storeWorkspaceState.updateMany({
      where: { storeId, version: record.version },
      data: { data: jsonValue(normalizeTestState(raw)), version: { increment: 1 } }
    });
    return readWorkspaceState(storeId);
  }
  return { ...normalizeTestState(raw), workspaceVersion: record.version };
}

export async function writeWorkspaceState(storeId: string, state: Partial<StoredTestState>) {
  if (!Number.isSafeInteger(state.workspaceVersion) || (state.workspaceVersion ?? 0) < 1) {
    throw new WorkspaceConflictError();
  }
  const normalized = normalizeTestState(state);
  // The comparison and replacement happen in one SQL statement. Incrementing alone
  // does not protect concurrent saves; both the run and expected revision must match.
  const updated = await prisma.storeWorkspaceState.updateMany({
    where: {
      storeId,
      version: state.workspaceVersion,
      data: { path: ["uatRunId"], equals: normalized.uatRunId }
    },
    data: { data: jsonValue(normalized), version: { increment: 1 } }
  });
  if (updated.count === 0) throw new WorkspaceConflictError();
  await protectWorkspaceAfterSave(storeId);
  return { ...normalized, workspaceVersion: state.workspaceVersion! + 1 };
}

/** Retry only server-owned operations recomputed from the latest state, never browser snapshots. */
export async function updateWorkspaceState(
  storeId: string,
  runId: string,
  update: (state: StoredTestState) => StoredTestState
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await readWorkspaceState(storeId);
    if (state.uatRunId !== runId) throw new StaleUatRunError();
    try {
      const next = update(state);
      if (next === state) return state;
      return await writeWorkspaceState(storeId, next);
    } catch (error) {
      if (!(error instanceof WorkspaceConflictError) || attempt === 4) throw error;
    }
  }
  throw new WorkspaceConflictError();
}

export async function resetWorkspaceState(storeId: string) {
  await overwriteWorkspaceBackup(storeId, "pre_reset");
  const cleanState = createCleanRunTestState(`uat_${randomUUID()}`);
  const record = await prisma.storeWorkspaceState.upsert({
    where: { storeId },
    update: { data: jsonValue(cleanState), version: { increment: 1 } },
    create: { storeId, data: jsonValue(cleanState) }
  });
  return { ...cleanState, workspaceVersion: record.version };
}

/** Allowlist employee reads, including write responses, before data reaches a browser. */
export function filterEmployeeWorkspace(state: StoredTestState, employeeId: string): StoredTestState {
  const ownRecord = <T>(records: Record<string, T>): Record<string, T> =>
    Object.hasOwn(records, employeeId) ? { [employeeId]: records[employeeId] } : {};
  const visibleShift = (shift: StoredTestState["shifts"][number]) => ({
    id: shift.id, schedulePeriodId: shift.schedulePeriodId, date: shift.date,
    startTime: shift.startTime, endTime: shift.endTime, employeeId: shift.employeeId,
    externalAssigneeName: shift.externalAssigneeName
  });
  return {
    workspaceVersion: state.workspaceVersion,
    uatRunId: state.uatRunId,
    people: state.people.filter((person) => person.active || person.id === employeeId).map((person) => ({
      id: person.id, name: person.name, role: person.role, active: person.active,
      email: person.id === employeeId ? person.email : ""
    })),
    period: state.period,
    shifts: state.period.status === "published" ? state.shifts.map(visibleShift) : [],
    availability: state.availability.filter((entry) => entry.userId === employeeId),
    availabilityDrafts: ownRecord(state.availabilityDrafts),
    preferences: ownRecord(state.preferences),
    coverage: state.coverage.filter((entry) => entry.status === "open" || entry.requestedById === employeeId || entry.claimedById === employeeId)
      .map((entry) => ({ ...entry, reason: entry.requestedById === employeeId ? entry.reason : "", managerNote: undefined })),
    swaps: state.swaps.filter((entry) => entry.requesterId === employeeId || entry.targetEmployeeId === employeeId)
      .map((entry) => ({ ...entry, managerNote: undefined })),
    notifications: state.notifications.filter((entry) => entry.userId === employeeId),
    auditLog: [], uatIssues: [], inviteAcceptances: [], uatChecklist: {},
    dayProgression: state.dayProgression,
    scheduleHistory: state.scheduleHistory.filter((entry) => entry.period.status !== "draft")
      .map((entry) => ({ ...entry, shifts: entry.shifts.map(visibleShift) }))
  };
}

function sameCoreSwap(left: SwapRequest, right: SwapRequest) {
  return left.id === right.id && left.requesterId === right.requesterId && left.targetEmployeeId === right.targetEmployeeId &&
    left.requesterShiftId === right.requesterShiftId && left.targetShiftId === right.targetShiftId && left.reason === right.reason;
}

function mergeEmployeeCoverage(existing: StoredTestState, candidate: StoredTestState, employeeId: string) {
  const next = [...existing.coverage];
  const existingIds = new Set(existing.coverage.map((request) => request.id));

  for (const request of candidate.coverage) {
    const prior = existing.coverage.find((item) => item.id === request.id);
    if (!prior) {
      const shift = allWorkspaceShifts(existing).find((item) => item.id === request.shiftId);
      if (request.requestedById === employeeId && request.status === "open" && !request.claimedById && shift?.employeeId === employeeId) {
        next.push({ ...request, requestedById: employeeId, status: "open", claimedById: undefined, managerNote: undefined });
      }
      continue;
    }

    if (
      prior.status === "open" &&
      request.status === "offered" &&
      request.claimedById === employeeId &&
      prior.requestedById !== employeeId &&
      prior.id === request.id && prior.shiftId === request.shiftId && prior.requestedById === request.requestedById
    ) {
      const index = next.findIndex((item) => item.id === request.id);
      next[index] = { ...prior, status: "offered", claimedById: employeeId };
    }
  }

  return next.filter((request, index) => !existingIds.has(request.id) || next.findIndex((item) => item.id === request.id) === index);
}

function mergeEmployeeSwaps(existing: StoredTestState, candidate: StoredTestState, employeeId: string) {
  const next = [...existing.swaps];

  for (const request of candidate.swaps) {
    const prior = existing.swaps.find((item) => item.id === request.id);
    if (!prior) {
      const requesterShift = allWorkspaceShifts(existing).find((item) => item.id === request.requesterShiftId);
      const targetShift = allWorkspaceShifts(existing).find((item) => item.id === request.targetShiftId);
      if (
        request.requesterId === employeeId &&
        request.status === "pending_employee_response" &&
        requesterShift?.employeeId === employeeId &&
        targetShift?.employeeId === request.targetEmployeeId &&
        request.targetEmployeeId !== employeeId
      ) {
        next.push({ ...request, requesterId: employeeId, status: "pending_employee_response", managerNote: undefined });
      }
      continue;
    }

    if (
      prior.status === "pending_employee_response" &&
      prior.targetEmployeeId === employeeId &&
      (request.status === "pending_manager_approval" || request.status === "declined_by_employee") &&
      sameCoreSwap(prior, request)
    ) {
      const index = next.findIndex((item) => item.id === request.id);
      next[index] = { ...prior, status: request.status };
    }
  }

  return next;
}

function appendEmployeeAudit(existing: AuditEntry[], candidate: AuditEntry[], employeeId: string) {
  const existingIds = new Set(existing.map((entry) => entry.id));
  const additions = candidate
    .filter((entry) => !existingIds.has(entry.id) && entry.actorId === employeeId)
    .map((entry) => ({ ...entry, actorId: employeeId }));
  return [...additions, ...existing];
}

function appendEmployeeNotifications(existing: NotificationEntry[], candidate: NotificationEntry[]) {
  const existingIds = new Set(existing.map((entry) => entry.id));
  return [...candidate.filter((entry) => !existingIds.has(entry.id)), ...existing];
}

function appendEmployeeIssues(existing: UatIssue[], candidate: UatIssue[], employeeId: string) {
  const existingIds = new Set(existing.map((issue) => issue.id));
  const additions = candidate
    .filter((issue) => !existingIds.has(issue.id) && issue.reportedById === employeeId)
    .map((issue) => ({ ...issue, reportedById: employeeId, activeEmployeeId: employeeId, role: "employee" as const, status: "open" as const, resolvedAt: undefined }));
  return [...additions, ...existing];
}

export function authorizeEmployeeStateUpdate(existing: StoredTestState, proposed: Partial<StoredTestState>, employeeId: string) {
  const candidate = normalizeTestState(proposed);
  const employeeAvailability = candidate.availability.filter((submission) => submission.userId === employeeId && submission.schedulePeriodId === existing.period.id);
  const employeeDrafts = candidate.availabilityDrafts[employeeId] ?? [];
  const employeePreference = candidate.preferences[employeeId];

  return normalizeTestState({
    ...existing,
    availability: [...existing.availability.filter((submission) => submission.userId !== employeeId || submission.schedulePeriodId !== existing.period.id), ...employeeAvailability],
    availabilityDrafts: {
      ...existing.availabilityDrafts,
      [employeeId]: employeeDrafts.map((entry) => ({ ...entry, userId: employeeId }))
    },
    preferences: employeePreference
      ? { ...existing.preferences, [employeeId]: employeePreference }
      : existing.preferences,
    coverage: mergeEmployeeCoverage(existing, candidate, employeeId),
    swaps: mergeEmployeeSwaps(existing, candidate, employeeId),
    auditLog: appendEmployeeAudit(existing.auditLog, candidate.auditLog, employeeId),
    notifications: appendEmployeeNotifications(existing.notifications, candidate.notifications),
    uatIssues: appendEmployeeIssues(existing.uatIssues, candidate.uatIssues, employeeId)
  });
}

export async function appendWorkspaceNotification(storeId: string, notification: NotificationEntry) {
  const state = await readWorkspaceState(storeId);
  return updateWorkspaceState(storeId, state.uatRunId, (latest) => ({
    ...latest,
    notifications: [notification, ...latest.notifications.filter((entry) => entry.id !== notification.id)]
  }));
}
