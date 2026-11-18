import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultTestState } from "../src/lib/test-state";
import {
  hasWorkspaceStateChanged,
  MANAGER_WORKSPACE_REFRESH_MS,
  WORKSPACE_IDLE_MS,
  workspaceStateFingerprint,
} from "../src/lib/workspace-sync";

test("workspace refresh ignores an unchanged server snapshot", () => {
  const state = createDefaultTestState();

  assert.equal(
    hasWorkspaceStateChanged(state, workspaceStateFingerprint(state)),
    false,
  );
});

test("workspace refresh detects a new employee availability submission", () => {
  const previous = createDefaultTestState();
  const next = {
    ...previous,
    availability: [
      {
        id: "availability_employee",
        schedulePeriodId: previous.period.id,
        userId: "emp_employee",
        submittedAt: "2026-08-27T03:00:00.000Z",
        unavailable: [],
      },
    ],
  };

  assert.equal(
    hasWorkspaceStateChanged(next, workspaceStateFingerprint(previous)),
    true,
  );
});

test("refresh timing balances freshness and idle transfer", () => {
  assert.equal(MANAGER_WORKSPACE_REFRESH_MS, 30_000);
  assert.equal(WORKSPACE_IDLE_MS, 300_000);
});
