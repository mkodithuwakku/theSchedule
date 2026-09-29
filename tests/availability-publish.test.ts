import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createDefaultTestState } from "@/lib/test-state";

const loadModule = createRequire(import.meta.url);

test("publication API rejects an October conflict even when September availability appears first", async (t) => {
  const state = createDefaultTestState();
  state.workspaceVersion = 10;
  state.period.id = "october";
  state.period.startDate = "2026-10-01";
  state.period.endDate = "2026-10-15";
  const person = state.people[1];
  state.shifts = [{ id: "oct9", schedulePeriodId: "october", date: "2026-10-09", startTime: "12:00", endTime: "18:00", employeeId: person.id }];
  state.availability = [
    { id: "old", schedulePeriodId: "september", userId: person.id, submittedAt: "2026-09-10", unavailable: [] },
    { id: "new", schedulePeriodId: "october", userId: person.id, submittedAt: "2026-09-28", unavailable: [{ id: "oct9", userId: person.id, date: "2026-10-09", allDay: false, unavailableType: "custom_time_range", startTime: "09:00", endTime: "15:00" }] }
  ];
  let writes = 0;
  let emails = 0;
  function replace(path: string, exports: object) {
    const id = loadModule.resolve(path);
    loadModule(id);
    const cached = loadModule.cache[id]!;
    const original = cached.exports;
    cached.exports = exports;
    t.after(() => { cached.exports = original; });
  }
  replace("../src/lib/access", { getCurrentAccess: async () => ({ role: "manager", storeId: "test" }), normalizeEmail: (value: string) => value.toLowerCase() });
  const realWorkspace = loadModule("../src/lib/workspace-state");
  replace("../src/lib/workspace-state", { ...realWorkspace, readWorkspaceState: async () => structuredClone(state), writeWorkspaceState: async () => { writes++; }, updateWorkspaceState: async () => { writes++; } });
  replace("../src/lib/schedule-notifications", { sendPublishedScheduleNotifications: async () => { emails++; } });
  const routeId = loadModule.resolve("../src/app/api/schedule/publish/route");
  const { POST } = loadModule(routeId);
  t.after(() => { delete loadModule.cache[routeId]; });
  const response = await POST(new Request("http://localhost/api/schedule/publish", { method: "POST", body: JSON.stringify({ uatRunId: state.uatRunId, workspaceVersion: 10, period: state.period, shifts: state.shifts }) }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert(body.issues.some((issue: { code: string }) => issue.code === "availability_conflict"));
  assert.equal(writes, 0);
  assert.equal(emails, 0);
});
