import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createDefaultTestState } from "../src/lib/test-state";
import { shouldSuppressShiftNotification } from "../src/lib/shift-notification-policy";

const shiftTypes = ["shift_assigned", "shift_unassigned", "shift_removed", "shift_updated"];
const loadModule = createRequire(import.meta.url);

test("draft shift edits are silent while published changes and other workflows retain notifications", () => {
  for (const type of shiftTypes) {
    assert.equal(shouldSuppressShiftNotification(type, "draft"), true);
    assert.equal(shouldSuppressShiftNotification(type, "archived"), true);
    assert.equal(shouldSuppressShiftNotification(type, "published"), false);
  }
  for (const type of ["availability_submitted", "availability_reminder", "schedule_published", "coverage_requested", "swap_requested", "uat_issue_reported"]) {
    assert.equal(shouldSuppressShiftNotification(type, "draft"), false);
  }
});

test("notification API suppresses draft emails from old tabs without sending or saving anything", async (t) => {
  // Replace all external dependencies before loading the actual route. No database,
  // authentication service, or email provider is contacted by this regression test.
  const state = createDefaultTestState("preserve-real-data");
  const original = structuredClone(state);
  let role = "manager";
  let sends = 0;
  let writes = 0;
  function replaceExports(path: string, exports: object) {
    const id = loadModule.resolve(path);
    loadModule(id);
    const cachedModule = loadModule.cache[id]!;
    const previous = cachedModule.exports;
    cachedModule.exports = exports;
    t.after(() => { cachedModule.exports = previous; });
  }
  replaceExports("../src/lib/access", {
    getCurrentAccess: async () => ({ storeId: "test-store", role })
  });
  replaceExports("../src/lib/workspace-state", {
    readWorkspaceState: async () => structuredClone(state),
    appendWorkspaceNotification: async () => { writes++; }
  });
  replaceExports("../src/lib/email", {
    OWNER_ALERT_EMAIL: "owner@example.com",
    sendScheduleEmail: async () => { sends++; return { status: "sent", providerId: "test-provider", reason: null }; }
  });
  const routeId = loadModule.resolve("../src/app/api/notifications/test-email/route");
  const { POST } = loadModule(routeId) as { POST: (request: Request) => Promise<Response> };
  t.after(() => { delete loadModule.cache[routeId]; });
  const send = (body: object) => POST(new Request("http://localhost/api/notifications/test-email", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  }));

  for (const type of shiftTypes) {
    // Old clients do not supply a period ID and can request either logging mode.
    for (const skipLog of [true, false]) {
      const response = await send({ id: "old-tab-notification", type, userId: state.people[0].id, skipLog });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.suppressed, true);
      assert.equal(result.notification.status, "suppressed");
    }
  }
  assert.equal(sends, 0);
  assert.equal(writes, 0);
  assert.deepEqual(state, original);

  state.period.status = "published";
  const stalePeriod = await send({ type: "shift_assigned", schedulePeriodId: "a-different-draft" });
  assert.equal((await stalePeriod.json()).suppressed, true);
  assert.equal(sends, 0);

  for (const type of shiftTypes) {
    const response = await send({ type, schedulePeriodId: state.period.id, userId: state.people[0].id });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).notification.status, "sent");
  }
  assert.equal(sends, shiftTypes.length);
  assert.equal(writes, shiftTypes.length);

  role = "employee";
  assert.equal((await send({ type: "shift_assigned" })).status, 403);
  assert.equal(sends, shiftTypes.length);
});
