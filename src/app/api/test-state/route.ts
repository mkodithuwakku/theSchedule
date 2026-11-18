import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { StoredTestState } from "@/lib/test-state-shared";
import type { AppAccess } from "@/lib/access-shared";
import { getCurrentAccess, normalizeEmail } from "@/lib/access";
import {
  authorizeEmployeeStateUpdate,
  assertWorkspaceRevision,
  filterEmployeeWorkspace,
  WorkspaceConflictError,
  readWorkspaceState,
  resetWorkspaceState,
  StaleUatRunError,
  writeWorkspaceState
} from "@/lib/workspace-state";

import { parseWorkspaceView, preserveUnloadedHistory } from "@/lib/workspace-view";
import { readWorkspaceRevision, readWorkspaceView, workspaceRevisionToken } from "@/lib/workspace-view-server";

function unauthorized() {
  return NextResponse.json({ error: "Sign in with an active employee account." }, { status: 401 });
}

function forbidden(message = "You do not have permission to do that.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

async function responseState(state: StoredTestState, access: AppAccess, knownActiveEmails?: string[]) {
  if (access.role === "manager") return state;
  const employee = state.people.find((person) => normalizeEmail(person.email) === access.email)!;
  const memberships = knownActiveEmails ? [] : await prisma.storeMembership.findMany({
    where: { storeId: access.storeId, active: true, user: { active: true } },
    select: { user: { select: { email: true } } }
  });
  const activeEmails = new Set(knownActiveEmails ?? memberships.map((membership) => normalizeEmail(membership.user.email ?? "")));
  return filterEmployeeWorkspace({ ...state,
    people: state.people.map((person) => ({
      ...person,
      active: person.active && activeEmails.has(normalizeEmail(person.email))
    }))
  }, employee.id);
}

export async function GET(request: Request) {
  const access = await getCurrentAccess();
  if (!access) return unauthorized();

  if (new URL(request.url).searchParams.get("view") === "compact") {
    const view = parseWorkspaceView(request.url);
    let revision = await readWorkspaceRevision(access);
    if (!revision) {
      await readWorkspaceState(access.storeId);
      revision = await readWorkspaceRevision(access);
    }
    if (!revision) return NextResponse.json({ error: "Workspace unavailable." }, { status: 503 });
    if (access.role === "employee" && !revision.active) return forbidden();
    const memberships = access.role === "employee" ? await prisma.storeMembership.findMany({
      where: { storeId: access.storeId, active: true, user: { active: true } },
      select: { user: { select: { email: true } } }
    }) : [];
    const activeEmails = memberships.map((membership) => normalizeEmail(membership.user.email ?? ""));
    const token = workspaceRevisionToken(revision, access, view, activeEmails);
    const headers = { "Cache-Control": "private, no-store", "X-Workspace-Revision": token, "X-Test-State-Persisted": "true" };
    if (request.headers.get("X-Workspace-Revision") === token) {
      return new NextResponse(null, { status: 204, headers });
    }
    const state = await readWorkspaceView(access, view, revision);
    if (!state) return NextResponse.json({ error: "Workspace unavailable." }, { status: 503 });
    if (access.role === "employee" && !state.people.some((person) => normalizeEmail(person.email) === access.email && person.active)) return forbidden();
    // If a save raced the metadata read, force another check rather than marking
    // a different snapshot as current. Saves still require its actual version.
    if (state.workspaceVersion !== revision.version || state.uatRunId !== revision.runId) headers["X-Workspace-Revision"] = "";
    return NextResponse.json({ ...await responseState(state, access, activeEmails), historyTotals: state.historyTotals }, { headers });
  }

  const state = await readWorkspaceState(access.storeId);
  const employee = state.people.find((person) => normalizeEmail(person.email) === access.email);
  if (access.role === "employee" && !employee?.active) return forbidden();
  return NextResponse.json(await responseState(state, access), {
    headers: { "X-Test-State-Persisted": "true", "Cache-Control": "private, no-store" }
  });
}

export async function PUT(request: Request) {
  const access = await getCurrentAccess();
  if (!access) return unauthorized();

  const proposed = await request.json();
  const existing = await readWorkspaceState(access.storeId);
  try {
    assertWorkspaceRevision(existing, proposed ?? {});
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 409 });
  }
  let nextState = request.headers.get("X-Workspace-View") === "compact" && access.role === "manager"
    ? preserveUnloadedHistory(existing, proposed)
    : proposed;

  if (access.role === "employee") {
    const employee = existing.people.find((person) => normalizeEmail(person.email) === access.email);
    if (!employee?.active) return forbidden("Your employee profile is not active in this schedule.");
    nextState = authorizeEmployeeStateUpdate(existing, proposed, employee.id);
  }

  let savedState;
  try {
    savedState = await writeWorkspaceState(access.storeId, nextState);
  } catch (error) {
    if (error instanceof StaleUatRunError || error instanceof WorkspaceConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json(await responseState(savedState, access), {
    headers: { "X-Test-State-Persisted": "true", "Cache-Control": "private, no-store" }
  });
}

export async function DELETE() {
  if (process.env.NODE_ENV === "production") return forbidden("Use the confirmed clean reset control.");
  const access = await getCurrentAccess();
  if (!access) return unauthorized();
  if (access.role !== "manager") return forbidden("Only managers can reset the schedule workspace.");

  const state = await resetWorkspaceState(access.storeId);
  return NextResponse.json(state, {
    headers: { "X-Test-State-Persisted": "true", "Cache-Control": "private, no-store" }
  });
}
