import type { StoredTestState } from "@/lib/test-state-shared";

export const WORKSPACE_SAVE_DEBOUNCE_MS = 200;
export const WORKSPACE_FOCUS_RETRY_MS = 1_500;
export const MANAGER_WORKSPACE_REFRESH_MS = 5_000;

export function workspaceStateFingerprint(state: Partial<StoredTestState>) {
  return JSON.stringify(state);
}

export function hasWorkspaceStateChanged(
  state: Partial<StoredTestState>,
  lastSyncedFingerprint: string | null,
) {
  return workspaceStateFingerprint(state) !== lastSyncedFingerprint;
}
