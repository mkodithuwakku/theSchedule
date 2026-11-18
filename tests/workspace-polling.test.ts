import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspacePoller } from "@/lib/workspace-polling";
import { MANAGER_WORKSPACE_REFRESH_MS, EMPLOYEE_WORKSPACE_REFRESH_MS } from "@/lib/workspace-sync";

test("polling pauses when idle/hidden/offline, coalesces resumes and backs off errors", async () => {
  let time = 0;
  let visible = true;
  let online = true;
  let succeed = true;
  let calls = 0;
  let scheduled: { callback: () => void; delay: number } | undefined;
  const poller = createWorkspacePoller({
    interval: MANAGER_WORKSPACE_REFRESH_MS, now: () => time,
    visible: () => visible, online: () => online,
    refresh: async () => { calls++; return succeed; },
    schedule: (callback, delay) => { scheduled = { callback, delay }; return 1 as unknown as ReturnType<typeof setTimeout>; },
    cancel: () => { scheduled = undefined; }
  });
  const scheduledDelay = () => scheduled?.delay;
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  const tick = async () => {
    assert(scheduled);
    time += scheduled.delay;
    scheduled.callback();
    await flush();
  };
  assert.equal(EMPLOYEE_WORKSPACE_REFRESH_MS, 60_000);
  await tick();
  assert.equal(calls, 1);
  for (let i = 0; i < 9; i++) await tick();
  assert.equal(calls, 9, "the five-minute idle boundary does not issue another query");
  assert.equal(scheduled, undefined);
  poller.activity();
  await flush();
  assert.equal(calls, 10);
  poller.resume(); poller.resume();
  await flush();
  assert.equal(calls, 10, "focus and visibility events do not duplicate the request");
  visible = false; poller.resume();
  assert.equal(scheduled, undefined);
  time += 60_000; visible = true; poller.resume();
  await flush();
  assert.equal(calls, 11);
  online = false; poller.resume();
  assert.equal(scheduled, undefined);
  time += 60_000; online = true; poller.resume();
  await flush();
  assert.equal(calls, 12);
  succeed = false;
  await tick();
  assert.equal(scheduledDelay(), 60_000);
  await tick();
  assert.equal(scheduledDelay(), 120_000);
  succeed = true;
  poller.activity();
  await tick();
  assert.equal(scheduledDelay(), 30_000);
  poller.stop();
  assert.equal(scheduled, undefined);
  poller.resume();
  await flush();
  assert.equal(scheduled, undefined);
});
