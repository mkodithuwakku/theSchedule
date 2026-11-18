import type { StoredTestState } from "@/lib/test-state-shared";

/** Transport-only options. Never persisted in the shared workspace. */
export type WorkspaceView = { audit: boolean; notifications: boolean; schedules: boolean };
export const DEFAULT_WORKSPACE_VIEW: WorkspaceView = { audit: false, notifications: false, schedules: false };
export type WorkspaceViewState = StoredTestState & {
  historyTotals?: { audit: number; notifications: number; schedules: number };
};

export function workspaceViewUrl(view: WorkspaceView) {
  const query = new URLSearchParams({ view: "compact" });
  for (const key of ["audit", "notifications", "schedules"] as const) {
    if (view[key]) query.set(key, "all");
  }
  return `/api/test-state?${query}`;
}

export function parseWorkspaceView(url: string): WorkspaceView {
  const params = new URL(url).searchParams;
  return {
    audit: params.get("audit") === "all",
    notifications: params.get("notifications") === "all",
    schedules: params.get("schedules") === "all"
  };
}

/** Omitted history is not a deletion. Keep ordering and allow edits to loaded records. */
export function mergeLoadedHistory<T extends { id: string }>(existing: T[], loaded: T[]): T[] {
  const replacements = new Map(loaded.map((entry) => [entry.id, entry]));
  const existingIds = new Set(existing.map((entry) => entry.id));
  return [
    ...[...replacements.values()].filter((entry) => !existingIds.has(entry.id)),
    ...existing.map((entry) => replacements.get(entry.id) ?? entry)
  ];
}

export function preserveUnloadedHistory(existing: StoredTestState, proposed: Partial<StoredTestState>) {
  return {
    ...proposed,
    auditLog: mergeLoadedHistory(existing.auditLog, proposed.auditLog ?? []),
    notifications: mergeLoadedHistory(existing.notifications, proposed.notifications ?? []),
    scheduleHistory: mergeLoadedHistory(existing.scheduleHistory, proposed.scheduleHistory ?? [])
  };
}
