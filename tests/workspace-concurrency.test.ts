import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@/lib/prisma";
import { createDefaultTestState } from "@/lib/test-state";
import {
  assertWorkspaceRevision, authorizeEmployeeStateUpdate, readWorkspaceState,
  StaleUatRunError, updateWorkspaceState, WorkspaceConflictError, writeWorkspaceState
} from "@/lib/workspace-state";

// Exercise the real repository methods against an atomic in-memory database adapter.
// This models UPDATE ... WHERE version = expected; no production database is touched.
test("concurrent browser writes reject stale snapshots and preserve the winning write", async (t) => {
  function replaceMethod(target: object, name: string, implementation: unknown) {
    const delegate = target as Record<string, unknown>;
    const original = delegate[name];
    delegate[name] = implementation;
    t.after(() => { delegate[name] = original; });
  }
  let row = { data: createDefaultTestState("run_current"), version: 7 };
  const whereVersions: number[] = [];
  replaceMethod(prisma.storeWorkspaceState, "upsert", async () => structuredClone(row));
  replaceMethod(prisma.storeWorkspaceState, "updateMany", async (args: {
    where: { version: number; data: { equals: string } };
    data: { data: typeof row.data };
  }) => {
    whereVersions.push(args.where.version);
    if (row.version !== args.where.version || row.data.uatRunId !== args.where.data.equals) return { count: 0 };
    row = { data: structuredClone(args.data.data), version: row.version + 1 };
    return { count: 1 };
  });
  replaceMethod(prisma.storeWorkspaceBackup, "findUnique", async () => ({ reason: "manual", backedUpAt: new Date(), sourceUpdatedAt: new Date(), restoredAt: null }));

  const first = await readWorkspaceState("store_test");
  const second = await readWorkspaceState("store_test");
  first.people[0].name = "Manager's new name";
  second.period.name = "Stale manager draft";
  const results = await Promise.allSettled([
    writeWorkspaceState("store_test", first), writeWorkspaceState("store_test", second)
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected");
  assert(rejected?.status === "rejected" && rejected.reason instanceof WorkspaceConflictError);
  assert.equal(row.data.people[0].name, "Manager's new name");
  assert.notEqual(row.data.period.name, "Stale manager draft");
  assert.deepEqual(whereVersions, [7, 7]);
  assert.equal((await readWorkspaceState("store_test")).workspaceVersion, 8);

  // Two employees can race after reading the same database state. The second must
  // reload before retrying; its retry preserves the first employee's availability.
  const base = await readWorkspaceState("store_test");
  const [employeeA, employeeB] = base.people.filter((p) => p.role === "employee");
  const submission = (id: string) => ({ id, userId: id, schedulePeriodId: base.period.id, unavailable: [] });
  const a = authorizeEmployeeStateUpdate(base, { ...base, availability: [submission(employeeA.id)] }, employeeA.id);
  const b = authorizeEmployeeStateUpdate(base, { ...base, availability: [submission(employeeB.id)] }, employeeB.id);
  await writeWorkspaceState("store_test", a);
  await assert.rejects(writeWorkspaceState("store_test", b), WorkspaceConflictError);
  const latest = await readWorkspaceState("store_test");
  await writeWorkspaceState("store_test", authorizeEmployeeStateUpdate(latest, { ...latest, availability: [submission(employeeB.id)] }, employeeB.id));
  assert.deepEqual(new Set(row.data.availability.map((s) => s.userId)), new Set([employeeA.id, employeeB.id]));

  // A server notification append recomputes from the latest version after a race.
  let calls = 0;
  await updateWorkspaceState("store_test", base.uatRunId, (current) => {
    if (calls++ === 0) {
      row.data.people[0].name = "Edited while email was sending";
      row.version++;
    }
    return { ...current, notifications: [{ id: "mail_1", type: "schedule_published", subject: "Sent", status: "sent", createdAt: new Date().toISOString() }, ...current.notifications] };
  });
  assert.equal(calls, 2);
  assert.equal(row.data.people[0].name, "Edited while email was sending");
  assert.equal(row.data.notifications.filter((n) => n.id === "mail_1").length, 1);

  row.data.uatRunId = "reset_run";
  row.version++;
  await assert.rejects(writeWorkspaceState("store_test", latest), WorkspaceConflictError);
  await assert.rejects(updateWorkspaceState("store_test", base.uatRunId, (s) => s), StaleUatRunError);
});

test("missing, forged, and stale versions cannot authorize publishing or browser saves", () => {
  const state = { ...createDefaultTestState("run"), workspaceVersion: 3 };
  assert.throws(() => assertWorkspaceRevision(state, { uatRunId: "run" }), WorkspaceConflictError);
  assert.throws(() => assertWorkspaceRevision(state, { ...state, workspaceVersion: 2 }), WorkspaceConflictError);
  assert.throws(() => assertWorkspaceRevision(state, { ...state, workspaceVersion: 3.5 }), WorkspaceConflictError);
  assert.throws(() => assertWorkspaceRevision(state, { ...state, uatRunId: "old" }), StaleUatRunError);
  assert.doesNotThrow(() => assertWorkspaceRevision(state, state));
});
