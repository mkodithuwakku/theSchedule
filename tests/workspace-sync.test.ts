import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultTestState } from "../src/lib/test-state";
import {
  hasWorkspaceStateChanged,
  MANAGER_WORKSPACE_REFRESH_MS,
  WORKSPACE_FOCUS_RETRY_MS,
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

test("manager polling and tab-return retry remain prompt for UAT", () => {
  assert.ok(MANAGER_WORKSPACE_REFRESH_MS <= 5_000);
  assert.ok(WORKSPACE_FOCUS_RETRY_MS <= 1_500);
});
