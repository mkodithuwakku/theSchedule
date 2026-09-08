import { prisma } from "@/lib/prisma";
import { openDueScheduleCycle } from "@/lib/schedule-progression";
import { overwriteWorkspaceBackup } from "@/lib/workspace-backup";
import { readWorkspaceState, updateWorkspaceState } from "@/lib/workspace-state";

export async function openDueScheduleWindows(now = new Date()) {
  const stores = await prisma.store.findMany({ select: { id: true, timezone: true } });
  const results: Array<{ storeId: string; opened: boolean; periodId: string }> = [];
  for (const store of stores) {
    const state = await readWorkspaceState(store.id);
    if (openDueScheduleCycle(state, now, store.timezone) === state) {
      results.push({ storeId: store.id, opened: false, periodId: state.period.id });
      continue;
    }
    await overwriteWorkspaceBackup(store.id, "manual");
    const next = await updateWorkspaceState(store.id, state.uatRunId,
      (latest) => openDueScheduleCycle(latest, now, store.timezone));
    results.push({ storeId: store.id, opened: next.period.id !== state.period.id, periodId: next.period.id });
  }
  return results;
}
