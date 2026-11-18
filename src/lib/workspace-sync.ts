import type { StoredTestState } from "@/lib/test-state-shared";

export const WORKSPACE_SAVE_DEBOUNCE_MS = 200;
export const WORKSPACE_IDLE_MS = 5 * 60_000;
export const MANAGER_WORKSPACE_REFRESH_MS = 30_000;
export const EMPLOYEE_WORKSPACE_REFRESH_MS = 60_000;

export function workspaceStateFingerprint(state: Partial<StoredTestState>) {
  return JSON.stringify(state);
}

export function hasWorkspaceStateChanged(
  state: Partial<StoredTestState>,
  lastSyncedFingerprint: string | null,
) {
  return workspaceStateFingerprint(state) !== lastSyncedFingerprint;
}
