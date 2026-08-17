import type { AuditEntry, CoverageRequest, NotificationEntry, SwapRequest } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";
import { createDefaultTestState, normalizeTestState } from "@/lib/test-state";
import type { StoredTestState, UatIssue } from "@/lib/test-state-shared";

function jsonValue<T>(value: T) {
  return JSON.parse(JSON.stringify(value));
}

export class StaleUatRunError extends Error {
  constructor() {
    super("This browser belongs to an older UAT run. Refresh before saving.");
    this.name = "StaleUatRunError";
  }
}

export async function readWorkspaceState(storeId: string): Promise<StoredTestState> {
  const record = await prisma.storeWorkspaceState.findUnique({ where: { storeId } });
  if (!record) return createDefaultTestState();
  const rawState = record.data as Partial<StoredTestState>;
  const normalized = normalizeTestState(rawState);
  if (!rawState.uatRunId) {
    await prisma.storeWorkspaceState.update({
      where: { storeId },
      data: { data: jsonValue(normalized) }
    });
  }
  return normalized;
}

export async function writeWorkspaceState(storeId: string, state: Partial<StoredTestState>) {
  const normalized = normalizeTestState(state);
  const existing = await prisma.storeWorkspaceState.findUnique({
    where: { storeId },
    select: { storeId: true }
  });
  if (!existing) {
    await prisma.storeWorkspaceState.create({
      data: {
        storeId,
        data: jsonValue(normalized)
      }
    });
    return normalized;
  }

  const updated = await prisma.storeWorkspaceState.updateMany({
    where: {
      storeId,
      data: {
        path: ["uatRunId"],
        equals: normalized.uatRunId
      }
    },
    data: {
      data: jsonValue(normalized),
      version: { increment: 1 }
    }
  });
  if (updated.count === 0) throw new StaleUatRunError();
  return normalized;
}

export async function resetWorkspaceState(storeId: string) {
  const cleanState = createDefaultTestState();
  await prisma.storeWorkspaceState.upsert({
    where: { storeId },
    update: {
      data: jsonValue(cleanState),
      version: { increment: 1 }
    },
    create: {
      storeId,
      data: jsonValue(cleanState)
    }
  });
  return cleanState;
}

function sameCoreCoverage(left: CoverageRequest, right: CoverageRequest) {
  return left.id === right.id && left.shiftId === right.shiftId && left.requestedById === right.requestedById && left.reason === right.reason;
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
      const shift = existing.shifts.find((item) => item.id === request.shiftId);
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
      sameCoreCoverage(prior, request)
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
      const requesterShift = existing.shifts.find((item) => item.id === request.requesterShiftId);
      const targetShift = existing.shifts.find((item) => item.id === request.targetShiftId);
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
  const employeeAvailability = candidate.availability.filter((submission) => submission.userId === employeeId);
  const employeeDrafts = candidate.availabilityDrafts[employeeId] ?? [];
  const employeePreference = candidate.preferences[employeeId];

  return normalizeTestState({
    ...existing,
    availability: [...existing.availability.filter((submission) => submission.userId !== employeeId), ...employeeAvailability],
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
  return writeWorkspaceState(storeId, {
    ...state,
    notifications: [notification, ...state.notifications.filter((entry) => entry.id !== notification.id)]
  });
}
