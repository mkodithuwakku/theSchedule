import { NextResponse } from "next/server";
import { createDefaultTestState, isTestStateWriteUnavailable, normalizeTestState, readTestState, resetTestState, writeTestState } from "@/lib/test-state";

export async function GET() {
  const state = await readTestState();
  return NextResponse.json(state);
}

export async function PUT(request: Request) {
  const state = await request.json();
  let savedState;
  let persisted = true;

  try {
    savedState = await writeTestState(state);
  } catch (error) {
    if (!isTestStateWriteUnavailable(error)) throw error;
    savedState = normalizeTestState(state);
    persisted = false;
  }

  return NextResponse.json(savedState, {
    headers: {
      "X-Test-State-Persisted": persisted ? "true" : "false"
    }
  });
}

export async function DELETE() {
  let state;
  let persisted = true;

  try {
    state = await resetTestState();
  } catch (error) {
    if (!isTestStateWriteUnavailable(error)) throw error;
    state = createDefaultTestState();
    persisted = false;
  }

  return NextResponse.json(state, {
    headers: {
      "X-Test-State-Persisted": persisted ? "true" : "false"
    }
  });
}
