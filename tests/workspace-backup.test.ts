import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkspaceBackupFingerprint,
  isWorkspaceBackupCurrentForDay,
  shouldPreserveBackupAfterSave,
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

test("daily backup freshness follows the Edmonton calendar day", () => {
  const lateEvening = new Date("2026-08-18T05:30:00.000Z");
  const beforeLocalMidnight = new Date("2026-08-18T05:59:59.000Z");
  const afterLocalMidnight = new Date("2026-08-18T06:00:00.000Z");

  assert.equal(isWorkspaceBackupCurrentForDay(lateEvening, beforeLocalMidnight), true);
  assert.equal(isWorkspaceBackupCurrentForDay(lateEvening, afterLocalMidnight), false);
});

test("automatic saves preserve only a same-day pre-reset recovery point", () => {
  const backedUpAt = new Date("2026-08-18T05:30:00.000Z");

  assert.equal(shouldPreserveBackupAfterSave({ reason: "pre_reset", backedUpAt }, new Date("2026-08-18T05:59:59.000Z")), true);
  assert.equal(shouldPreserveBackupAfterSave({ reason: "daily", backedUpAt }, new Date("2026-08-18T05:59:59.000Z")), false);
  assert.equal(shouldPreserveBackupAfterSave({ reason: "pre_reset", backedUpAt }, new Date("2026-08-18T06:00:00.000Z")), false);
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
