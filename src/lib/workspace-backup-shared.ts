export const RESTORE_WORKSPACE_CONFIRMATION = "RESTORE LATEST BACKUP";

export type WorkspaceBackupReason = "daily" | "manual" | "pre_reset";

export type WorkspaceBackupStatus = {
  exists: boolean;
  backedUpAt?: string;
  sourceUpdatedAt?: string;
  sourceVersion?: number;
  sourceRunId?: string;
  reason?: WorkspaceBackupReason;
  checksum?: string;
  byteSize?: number;
  restoredAt?: string;
  restoreCount?: number;
};

export function isRestoreWorkspaceConfirmation(value: unknown) {
  return value === RESTORE_WORKSPACE_CONFIRMATION;
}
