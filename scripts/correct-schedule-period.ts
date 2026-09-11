import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { correctSecondHalfDraft } from "../src/lib/schedule-period-correction";
import type { StoredTestState } from "../src/lib/test-state-shared";
import { overwriteWorkspaceBackupWithClient } from "../src/lib/workspace-backup";

// Dry run unless --apply is supplied. Never resets, seeds, or rewrites invitation tables.
async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => args[args.indexOf(name) + 1];
  const storeId = args.includes("--store") ? option("--store") : undefined;
  const periodId = args.includes("--period") ? option("--period") : undefined;
  const expectedVersion = args.includes("--expected-version") ? Number(option("--expected-version")) : undefined;
  const apply = args.includes("--apply");
  if (!storeId || !periodId || (apply && !Number.isSafeInteger(expectedVersion))) {
    throw new Error("Usage: --store ID --period ID [--apply --expected-version N]");
  }

  await prisma.$transaction(async (tx) => {
    const record = await tx.storeWorkspaceState.findUniqueOrThrow({ where: { storeId } });
    const before = record.data as unknown as StoredTestState;
    assert.equal(before.period.id, periodId, "The active period has changed; inspect again.");
    if (apply) assert.equal(record.version, expectedVersion, "The workspace has changed; run a fresh dry run.");
    const after = correctSecondHalfDraft(before);
    assert.equal(before.period.status, "draft", "Only an unpublished draft can be corrected.");
    if (after === before) {
      console.log(JSON.stringify({ changed: false, version: record.version, period: before.period }));
      return;
    }

    // Compare every other field, including all submitted/draft availability and identities.
    const preserved = (state: StoredTestState) => {
      const { period, shifts, auditLog, ...rest } = state;
      void period; void shifts; void auditLog;
      return rest;
    };
    assert.deepEqual(preserved(after), preserved(before));
    assert.deepEqual(after.shifts, before.shifts.filter((shift) => shift.date !== before.period.startDate));

    let backup;
    if (apply) {
      backup = await overwriteWorkspaceBackupWithClient(tx, storeId, "manual");
      assert.equal(backup.sourceVersion, record.version);
      const updated = await tx.storeWorkspaceState.updateMany({
        where: { storeId, version: record.version, data: { path: ["uatRunId"], equals: before.uatRunId } },
        data: { data: after as unknown as Prisma.InputJsonValue, version: { increment: 1 } }
      });
      assert.equal(updated.count, 1, "Concurrent workspace change; correction rolled back.");
      const saved = await tx.storeWorkspaceState.findUniqueOrThrow({ where: { storeId } });
      assert.deepEqual(saved.data, JSON.parse(JSON.stringify(after)));
    }
    console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", storeId, version: record.version,
      newVersion: apply ? record.version + 1 : undefined, before: before.period, after: after.period,
      retainedShifts: after.shifts.length, removedShifts: before.shifts.length - after.shifts.length,
      preservedAvailability: before.availability.length, preservedPeople: before.people.length, backup }, null, 2));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
