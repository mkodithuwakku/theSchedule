import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createDefaultTestState, normalizeTestState } from "@/lib/test-state";
import type { StoredTestState } from "@/lib/test-state-shared";
import type { WorkspaceBackupReason, WorkspaceBackupStatus } from "@/lib/workspace-backup-shared";

type BackupDatabase = Pick<Prisma.TransactionClient, "storeWorkspaceState" | "storeWorkspaceBackup">;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }
  return value;
}

export function createWorkspaceBackupFingerprint(value: unknown) {
  const canonicalJson = JSON.stringify(canonicalize(value));
  return {
    checksum: createHash("sha256").update(canonicalJson).digest("hex"),
    byteSize: Buffer.byteLength(canonicalJson, "utf8")
  };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function backupStatus(record: {
  backedUpAt: Date;
  sourceUpdatedAt: Date;
  sourceVersion: number;
  sourceRunId: string;
  reason: string;
  checksum: string;
  byteSize: number;
  restoredAt: Date | null;
  restoreCount: number;
} | null): WorkspaceBackupStatus {
  if (!record) return { exists: false };
  return {
    exists: true,
    backedUpAt: record.backedUpAt.toISOString(),
    sourceUpdatedAt: record.sourceUpdatedAt.toISOString(),
    sourceVersion: record.sourceVersion,
    sourceRunId: record.sourceRunId,
    reason: record.reason as WorkspaceBackupReason,
    checksum: record.checksum,
    byteSize: record.byteSize,
    restoredAt: record.restoredAt?.toISOString(),
    restoreCount: record.restoreCount
  };
}

export async function overwriteWorkspaceBackupWithClient(
  database: BackupDatabase,
  storeId: string,
  reason: WorkspaceBackupReason
) {
  let workspace = await database.storeWorkspaceState.findUnique({
    where: { storeId },
    select: { data: true, version: true, updatedAt: true }
  });
  if (!workspace) {
    const defaultState = createDefaultTestState();
    workspace = await database.storeWorkspaceState.upsert({
      where: { storeId },
      update: {},
      create: {
        storeId,
        data: jsonValue(defaultState)
      },
      select: { data: true, version: true, updatedAt: true }
    });
  }

  const normalized = normalizeTestState(workspace.data as Partial<StoredTestState>);
  const fingerprint = createWorkspaceBackupFingerprint(normalized);
  const backedUpAt = new Date();
  const backup = await database.storeWorkspaceBackup.upsert({
    where: { storeId },
    update: {
      data: jsonValue(normalized),
      sourceVersion: workspace.version,
      sourceRunId: normalized.uatRunId,
      sourceUpdatedAt: workspace.updatedAt,
      reason,
      ...fingerprint,
      backedUpAt
    },
    create: {
      storeId,
      data: jsonValue(normalized),
      sourceVersion: workspace.version,
      sourceRunId: normalized.uatRunId,
      sourceUpdatedAt: workspace.updatedAt,
      reason,
      ...fingerprint,
      backedUpAt
    }
  });
  return backupStatus(backup);
}

export async function overwriteWorkspaceBackup(storeId: string, reason: WorkspaceBackupReason) {
  return overwriteWorkspaceBackupWithClient(prisma, storeId, reason);
}

export async function overwriteAllWorkspaceBackups() {
  const stores = await prisma.store.findMany({ select: { id: true } });
  return Promise.all(stores.map(({ id }) => overwriteWorkspaceBackup(id, "daily")));
}

export async function readWorkspaceBackupStatus(storeId: string) {
  const backup = await prisma.storeWorkspaceBackup.findUnique({ where: { storeId } });
  return backupStatus(backup);
}

export class WorkspaceBackupNotFoundError extends Error {
  constructor() {
    super("No schedule backup exists yet.");
    this.name = "WorkspaceBackupNotFoundError";
  }
}

export class WorkspaceBackupIntegrityError extends Error {
  constructor() {
    super("The saved schedule backup failed its integrity check and was not restored.");
    this.name = "WorkspaceBackupIntegrityError";
  }
}

export async function restoreWorkspaceBackup(storeId: string) {
  return prisma.$transaction(async (transaction) => {
    const backup = await transaction.storeWorkspaceBackup.findUnique({ where: { storeId } });
    if (!backup) throw new WorkspaceBackupNotFoundError();

    const fingerprint = createWorkspaceBackupFingerprint(backup.data);
    if (fingerprint.checksum !== backup.checksum || fingerprint.byteSize !== backup.byteSize) {
      throw new WorkspaceBackupIntegrityError();
    }

    const normalized = normalizeTestState(backup.data as Partial<StoredTestState>);
    const restoredState = {
      ...normalized,
      uatRunId: `uat_${randomUUID()}`
    };
    const restoredAt = new Date();
    await transaction.storeWorkspaceState.upsert({
      where: { storeId },
      update: {
        data: jsonValue(restoredState),
        version: { increment: 1 }
      },
      create: {
        storeId,
        data: jsonValue(restoredState)
      }
    });
    const updatedBackup = await transaction.storeWorkspaceBackup.update({
      where: { storeId },
      data: {
        restoredAt,
        restoreCount: { increment: 1 }
      }
    });

    return {
      restoredAt: restoredAt.toISOString(),
      uatRunId: restoredState.uatRunId,
      backup: backupStatus(updatedBackup)
    };
  });
}
