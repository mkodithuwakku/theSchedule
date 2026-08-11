import { NextResponse } from "next/server";
import { getCurrentAccess, normalizeEmail } from "@/lib/access";
import {
  authorizeEmployeeStateUpdate,
  readWorkspaceState,
  resetWorkspaceState,
  writeWorkspaceState
} from "@/lib/workspace-state";

function unauthorized() {
  return NextResponse.json({ error: "Sign in with an active employee account." }, { status: 401 });
}

function forbidden(message = "You do not have permission to do that.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function GET() {
  const access = await getCurrentAccess();
  if (!access) return unauthorized();

  const state = await readWorkspaceState(access.storeId);
  return NextResponse.json(state, {
    headers: { "X-Test-State-Persisted": "true" }
  });
}

export async function PUT(request: Request) {
  const access = await getCurrentAccess();
  if (!access) return unauthorized();

  const proposed = await request.json();
  const existing = await readWorkspaceState(access.storeId);
  let nextState = proposed;

  if (access.role === "employee") {
    const employee = existing.people.find((person) => normalizeEmail(person.email) === access.email);
    if (!employee?.active) return forbidden("Your employee profile is not active in this schedule.");
    nextState = authorizeEmployeeStateUpdate(existing, proposed, employee.id);
  }

  const savedState = await writeWorkspaceState(access.storeId, nextState);
  return NextResponse.json(savedState, {
    headers: { "X-Test-State-Persisted": "true" }
  });
}

export async function DELETE() {
  const access = await getCurrentAccess();
  if (!access) return unauthorized();
  if (access.role !== "manager") return forbidden("Only managers can reset the schedule workspace.");

  const state = await resetWorkspaceState(access.storeId);
  return NextResponse.json(state, {
    headers: { "X-Test-State-Persisted": "true" }
  });
}
