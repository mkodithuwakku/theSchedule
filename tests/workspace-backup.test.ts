import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkspaceBackupFingerprint,
  WorkspaceBackupIntegrityError,
  WorkspaceBackupNotFoundError
} from "../src/lib/workspace-backup";
import {
  isRestoreWorkspaceConfirmation,
  RESTORE_WORKSPACE_CONFIRMATION
} from "../src/lib/workspace-backup-shared";

test("backup fingerprints are stable when object keys are reordered", () => {
  const first = createWorkspaceBackupFingerprint({
    shifts: [{ id: "shift_1", date: "2026-08-17" }],
    period: { endDate: "2026-08-30", startDate: "2026-08-17" }
  });
  const reordered = createWorkspaceBackupFingerprint({
    period: { startDate: "2026-08-17", endDate: "2026-08-30" },
    shifts: [{ date: "2026-08-17", id: "shift_1" }]
  });

  assert.deepEqual(first, reordered);
  assert.match(first.checksum, /^[a-f0-9]{64}$/);
  assert.ok(first.byteSize > 0);
});

test("backup fingerprints change when schedule content changes", () => {
  const first = createWorkspaceBackupFingerprint({ shifts: [{ id: "shift_1", employeeId: "employee_1" }] });
  const changed = createWorkspaceBackupFingerprint({ shifts: [{ id: "shift_1", employeeId: "employee_2" }] });

  assert.notEqual(first.checksum, changed.checksum);
});

test("restore requires the exact guarded confirmation phrase", () => {
  assert.equal(isRestoreWorkspaceConfirmation(RESTORE_WORKSPACE_CONFIRMATION), true);
  assert.equal(isRestoreWorkspaceConfirmation("restore latest backup"), false);
  assert.equal(isRestoreWorkspaceConfirmation(`${RESTORE_WORKSPACE_CONFIRMATION} `), false);
});

test("backup service errors provide safe manager-facing messages", () => {
  assert.equal(new WorkspaceBackupNotFoundError().message, "No schedule backup exists yet.");
  assert.match(new WorkspaceBackupIntegrityError().message, /failed its integrity check/);
});
