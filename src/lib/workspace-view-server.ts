import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { dateInTimeZone } from "@/lib/schedule-rollout";
import { normalizeTestState } from "@/lib/test-state";
import type { AppAccess } from "@/lib/access-shared";
import type { StoredTestState } from "@/lib/test-state-shared";
import type { WorkspaceView, WorkspaceViewState } from "@/lib/workspace-view";

export type WorkspaceRevision = { version: number; runId: string; employeeId: string | null; active: boolean | null; today: string };

/** This query deliberately never returns the workspace JSON. Access still runs on every check. */
export async function readWorkspaceRevision(access: AppAccess): Promise<WorkspaceRevision | null> {
  const today = dateInTimeZone(new Date(), "America/Edmonton");
  const rows = await prisma.$queryRaw<WorkspaceRevision[]>`
    SELECT version, data->>'uatRunId' AS "runId",
      person->>'id' AS "employeeId", (person->>'active')::boolean AS active,
      CASE WHEN data->'dayProgression'->>'enabled' = 'true'
        THEN data->'dayProgression'->>'currentDate' ELSE ${today} END AS today
    FROM "StoreWorkspaceState"
    LEFT JOIN LATERAL (
      SELECT value AS person FROM jsonb_array_elements(data->'people')
      WHERE lower(value->>'email') = ${access.email} LIMIT 1
    ) employee ON true
    WHERE "storeId" = ${access.storeId}`;
  return rows[0] ?? null;
}

export function workspaceRevisionToken(revision: WorkspaceRevision, access: AppAccess, view: WorkspaceView, activeEmails: string[]) {
  // Include role, membership roster, day and view: a matching workspace version alone
  // cannot authorize reuse after deactivation, a role change, midnight or a history request.
  return createHash("sha256").update(JSON.stringify([
    revision.version, revision.runId, revision.today, access.userId, access.role, view,
    [...activeEmails].sort()
  ])).digest("hex");
}

/** Projection happens inside Postgres, before bytes leave Neon. No schema migration. */
export async function readWorkspaceView(access: AppAccess, view: WorkspaceView, revision: WorkspaceRevision): Promise<WorkspaceViewState | null> {
  const manager = access.role === "manager";
  const rows = await prisma.$queryRaw<Array<{ version: number; data: StoredTestState; audit: number; notifications: number; schedules: number }>>`
    SELECT version,
      (data - 'auditLog' - 'notifications' - 'scheduleHistory') || jsonb_build_object(
        'auditLog', CASE WHEN ${manager} THEN
          (SELECT coalesce(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
           FROM jsonb_array_elements(data->'auditLog') WITH ORDINALITY a(value, ord)
           WHERE ${view.audit} OR ord <= 6) ELSE '[]'::jsonb END,
        'notifications',
          (SELECT coalesce(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
           FROM jsonb_array_elements(data->'notifications') WITH ORDINALITY n(value, ord)
           WHERE (${manager} OR value->>'userId' = ${revision.employeeId}) AND
             (${view.notifications} OR ord <= 3 OR value->>'type' = 'employee_invited'
              OR (value->>'type' IN ('availability_reminder', 'schedule_published')
                  AND position(':' || (data->'period'->>'id') || ':' in value->>'id') > 0))),
        'scheduleHistory',
          (SELECT coalesce(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
           FROM jsonb_array_elements(data->'scheduleHistory') WITH ORDINALITY h(value, ord)
           WHERE (${manager} OR value->'period'->>'status' <> 'draft') AND
             (${view.schedules} OR value->'period'->>'endDate' >= ${revision.today}
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(value->'shifts') s,
                  jsonb_array_elements(data->'coverage') c
                WHERE c->>'shiftId' = s->>'id' AND c->>'status' IN ('open', 'offered'))
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(value->'shifts') s,
                  jsonb_array_elements(data->'swaps') r
                WHERE (r->>'requesterShiftId' = s->>'id' OR r->>'targetShiftId' = s->>'id')
                  AND r->>'status' IN ('pending_employee_response', 'pending_manager_approval'))))
      ) AS data,
      CASE WHEN ${manager} THEN jsonb_array_length(data->'auditLog') ELSE 0 END AS audit,
      (SELECT count(*)::int FROM jsonb_array_elements(data->'notifications') n
        WHERE ${manager} OR n->>'userId' = ${revision.employeeId}) AS notifications,
      (SELECT count(*)::int FROM jsonb_array_elements(data->'scheduleHistory') h
        WHERE ${manager} OR h->'period'->>'status' <> 'draft') AS schedules
    FROM "StoreWorkspaceState" WHERE "storeId" = ${access.storeId}`;
  const row = rows[0];
  return row ? {
    ...normalizeTestState(row.data), workspaceVersion: row.version,
    historyTotals: { audit: row.audit, notifications: row.notifications, schedules: row.schedules }
  } : null;
}
