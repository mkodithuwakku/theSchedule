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

function unauthorized() {
  return NextResponse.json({ error: "Sign in with an active employee account." }, { status: 401 });
}

function forbidden(message = "You do not have permission to do that.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

async function responseState(state: StoredTestState, access: AppAccess) {
  if (access.role === "manager") return state;
  const employee = state.people.find((person) => normalizeEmail(person.email) === access.email)!;
  const memberships = await prisma.storeMembership.findMany({
    where: { storeId: access.storeId, active: true, user: { active: true } },
    select: { user: { select: { email: true } } }
  });
  const activeEmails = new Set(memberships.map((membership) => normalizeEmail(membership.user.email ?? "")));
  return filterEmployeeWorkspace({ ...state,
    people: state.people.filter((person) => activeEmails.has(normalizeEmail(person.email)))
  }, employee.id);
}

export async function GET() {
  const access = await getCurrentAccess();
  if (!access) return unauthorized();

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
  let nextState = proposed;

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
