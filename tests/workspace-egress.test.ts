import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { prisma } from "@/lib/prisma";
import { createDefaultTestState } from "@/lib/test-state";
import { readWorkspaceRevision, readWorkspaceView } from "@/lib/workspace-view-server";
import { DEFAULT_WORKSPACE_VIEW, preserveUnloadedHistory, workspaceViewUrl } from "@/lib/workspace-view";
import type { AppAccess } from "@/lib/access-shared";
import type { StoredTestState } from "@/lib/test-state-shared";
import { readWorkspaceBackupStatus } from "@/lib/workspace-backup";

const requireModule = createRequire(import.meta.url);

test("real Postgres projection, conditional API reads, partial saves and backups preserve data", async (t) => {
  // Embedded Postgres: real SQL, no network or production credentials.
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE TABLE "StoreWorkspaceState" ("storeId" text PRIMARY KEY, data jsonb, version int, "updatedAt" timestamptz DEFAULT now())');
  const state = createDefaultTestState("egress-run");
  state.workspaceVersion = 5;
  state.dayProgression = { enabled: true, currentDate: "2026-11-18", cycleNumber: 3 };
  state.auditLog = Array.from({ length: 1000 }, (_, i) => ({ ...state.auditLog[0], id: `audit_${i}`, summary: `History ${i} ${"x".repeat(200)}` }));
  state.notifications = Array.from({ length: 200 }, (_, i) => ({
    id: `notification_${i}`, userId: state.people[1].id, type: "shift_updated", subject: `Notification ${i}`, status: "sent" as const, createdAt: "2026-11-01T00:00:00Z"
  }));
  state.notifications.push({ ...state.notifications[0], id: "old_invite", type: "employee_invited" });
  state.notifications.push({ ...state.notifications[0], id: `published:${state.period.id}:employee`, type: "schedule_published" });
  state.scheduleHistory = [
    { id: "ongoing", archivedAt: "now", period: { ...state.period, id: "ongoing", endDate: "2026-11-30", status: "published" }, shifts: [{ ...state.shifts[0], id: "current_shift", schedulePeriodId: "ongoing" }] },
    { id: "old", archivedAt: "then", period: { ...state.period, id: "old", endDate: "2026-10-31", status: "published" }, shifts: [{ ...state.shifts[0], id: "old_shift", schedulePeriodId: "old" }] }
  ];
  await db.query('INSERT INTO "StoreWorkspaceState" ("storeId", data, version) VALUES ($1, $2, 5)', ["store_test", JSON.stringify(state)]);
  const manager: AppAccess = { storeId: "store_test", userId: "manager_user", email: state.people[0].email.toLowerCase(), name: "Manager", image: null, role: "manager" };
  let access: AppAccess | null = manager;
  const queries: string[] = [];
  const bytes: number[] = [];
  function replace(target: object, name: string, value: unknown) {
    const object = target as Record<string, unknown>;
    const prior = object[name]; object[name] = value;
    t.after(() => { object[name] = prior; });
  }
  replace(prisma, "$queryRaw", async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, "");
    queries.push(sql);
    const { rows } = await db.query(sql, values);
    bytes.push(Buffer.byteLength(JSON.stringify(rows)));
    return rows;
  });
  replace(prisma.storeMembership, "findMany", async () => state.people.filter((p) => p.active).map((p) => ({ user: { email: p.email } })));
  replace(prisma.storeWorkspaceState, "upsert", async () => (await db.query('SELECT data, version FROM "StoreWorkspaceState" WHERE "storeId" = $1', ["store_test"])).rows[0]);
  replace(prisma.storeWorkspaceState, "updateMany", async (args: { where: { version: number; data: { equals: string } }; data: { data: StoredTestState } }) => {
    const result = await db.query('UPDATE "StoreWorkspaceState" SET data = $1, version = version + 1, "updatedAt" = now() WHERE version = $2 AND data->>\'uatRunId\' = $3 RETURNING version', [JSON.stringify(args.data.data), args.where.version, args.where.data.equals]);
    return { count: result.rows.length };
  });
  replace(prisma.storeWorkspaceState, "findUnique", async () => (await db.query('SELECT data, version, "updatedAt" FROM "StoreWorkspaceState"')).rows[0]);
  let backup: Record<string, unknown> | null = null;
  let backupWrites = 0;
  replace(prisma.storeWorkspaceBackup, "findUnique", async (args: { select: Record<string, boolean> }) => {
    assert(args.select && !args.select.data, "metadata checks never download the backup JSON");
    return backup && Object.fromEntries(Object.keys(args.select).map((key) => [key, backup![key]]));
  });
  replace(prisma.storeWorkspaceBackup, "upsert", async (args: { select: Record<string, boolean>; create: Record<string, unknown>; update: Record<string, unknown> }) => {
    assert(args.select && !args.select.data, "backup writes do not RETURN the full JSON");
    backup = { ...(backup ? args.update : args.create), restoredAt: null, restoreCount: 0 };
    backupWrites++;
    return Object.fromEntries(Object.keys(args.select).map((key) => [key, backup![key]]));
  });
  const accessId = requireModule.resolve("../src/lib/access");
  requireModule(accessId);
  const previousAccess = requireModule.cache[accessId]!.exports;
  requireModule.cache[accessId]!.exports = { getCurrentAccess: async () => access, normalizeEmail: (email: string) => email.trim().toLowerCase() };
  t.after(() => { requireModule.cache[accessId]!.exports = previousAccess; });
  const routeId = requireModule.resolve("../src/app/api/test-state/route");
  const route = requireModule(routeId) as { GET: (r: Request) => Promise<Response>; PUT: (r: Request) => Promise<Response> };
  t.after(() => { delete requireModule.cache[routeId]; });
  const get = (token = "", view = DEFAULT_WORKSPACE_VIEW) => route.GET(new Request(`http://localhost${workspaceViewUrl(view)}`, { headers: { "X-Workspace-Revision": token } }));
  const put = (body: object) => route.PUT(new Request("http://localhost/api/test-state", { method: "PUT", headers: { "Content-Type": "application/json", "X-Workspace-View": "compact" }, body: JSON.stringify(body) }));

  const first = await get();
  assert.equal(first.status, 200);
  const compact = await first.json();
  assert.equal(compact.auditLog.length, 6);
  assert.equal(compact.historyTotals.audit, 1000);
  assert.deepEqual(compact.scheduleHistory.map((h: { id: string }) => h.id), ["ongoing"]);
  assert(compact.notifications.some((n: { id: string }) => n.id === "old_invite"));
  assert(compact.notifications.some((n: { id: string }) => n.id.startsWith("published:")));
  assert(bytes[0] < 300, "the revision check is tiny");
  assert(bytes[1] < Buffer.byteLength(JSON.stringify(state)) / 5, "history is excluded before leaving Postgres");
  const token = first.headers.get("X-Workspace-Revision")!;
  const before = queries.length;
  assert.equal((await get(token)).status, 204);
  assert.equal(queries.length, before + 1, "an unchanged read never fetches the workspace");

  const expanded = await get(token, { audit: true, notifications: true, schedules: true });
  assert.equal(expanded.status, 200);
  const full = await expanded.json();
  assert.deepEqual(full.auditLog, state.auditLog);
  assert.deepEqual(full.scheduleHistory, state.scheduleHistory);
  assert.deepEqual(full.notifications, state.notifications);

  compact.period.name = "Changed with history unloaded";
  const saved = await put(compact);
  assert.equal(saved.status, 200);
  assert.equal(backupWrites, 1, "every successful save still refreshes its backup");
  const persisted = (await db.query<{ data: StoredTestState }>('SELECT data FROM "StoreWorkspaceState"')).rows[0].data;
  assert.equal(persisted.period.name, compact.period.name);
  assert.deepEqual(persisted.auditLog, state.auditLog);
  assert.deepEqual(persisted.notifications, state.notifications);
  assert.deepEqual(persisted.scheduleHistory, state.scheduleHistory);
  assert.deepEqual(backup!.data, persisted);
  assert.equal((await readWorkspaceBackupStatus("store_test")).exists, true);
  assert.equal((await put(compact)).status, 409, "stale partial saves still conflict");
  assert.equal(backupWrites, 1);
  assert.equal((await get(token)).status, 200, "changed revisions send updated data");

  // Historical edits are kept without erasing other unloaded archives.
  const edited = structuredClone(state.scheduleHistory[1]);
  edited.shifts[0].startTime = "11:00";
  const merged = preserveUnloadedHistory(state, { scheduleHistory: [edited], auditLog: [{ ...state.auditLog[0], id: "new_audit" }] });
  assert.equal(merged.scheduleHistory.length, 2);
  assert.equal(merged.scheduleHistory[1].shifts[0].startTime, "11:00");
  assert.equal(merged.auditLog.length, 1001);
  assert.equal(merged.auditLog[0].id, "new_audit");

  const current = await (await get("", { audit: true, notifications: true, schedules: true })).json();
  current.scheduleHistory[1].shifts[0].startTime = "11:00";
  current.auditLog.unshift({ ...current.auditLog[0], id: "correction_audit" });
  assert.equal((await put(current)).status, 200);
  const corrected = (await db.query<{ data: StoredTestState }>('SELECT data FROM "StoreWorkspaceState"')).rows[0].data;
  assert.equal(corrected.scheduleHistory[1].shifts[0].startTime, "11:00");
  assert.deepEqual(corrected.scheduleHistory[0], state.scheduleHistory[0]);
  assert.equal(corrected.auditLog.length, 1001);
  assert.equal(backupWrites, 2);
  assert.deepEqual(backup!.data, corrected);

  access = { ...manager, role: "employee", userId: "employee_user", email: state.people[1].email.toLowerCase() };
  const employeeResponse = await get(token, { audit: true, notifications: true, schedules: true });
  const employee = await employeeResponse.json();
  assert.equal(employeeResponse.status, 200);
  assert.deepEqual(employee.auditLog, []);
  assert.equal(employee.historyTotals.audit, 0);
  assert(!JSON.stringify(employee).includes(manager.email));
  assert.deepEqual(employee.shifts, [], "draft shifts are private");
  const employeeToken = employeeResponse.headers.get("X-Workspace-Revision")!;
  assert.equal((await get(employeeToken, { audit: true, notifications: true, schedules: true })).status, 204);
  await db.query('UPDATE "StoreWorkspaceState" SET data = jsonb_set(data, \'{people,1,active}\', \'false\')');
  assert.equal((await get(employeeToken)).status, 403, "deactivation rejects even a matching version");
  access = null;
  const queryCount = queries.length;
  assert.equal((await get(token)).status, 401);
  assert.equal(queries.length, queryCount);

  // Outstanding requests retain their old shifts until resolved.
  await db.query('UPDATE "StoreWorkspaceState" SET data = $1', [JSON.stringify({ ...state, coverage: [{ id: "request", shiftId: "old_shift", status: "offered", requestedById: state.people[1].id }] })]);
  const revision = await readWorkspaceRevision(manager);
  assert(revision);
  assert.equal((await readWorkspaceView(manager, DEFAULT_WORKSPACE_VIEW, revision))!.scheduleHistory.length, 2);
});
