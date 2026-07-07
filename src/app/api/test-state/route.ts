import { NextResponse } from "next/server";
import { readTestState, resetTestState, writeTestState } from "@/lib/test-state";

export async function GET() {
  const state = await readTestState();
  return NextResponse.json(state);
}

export async function PUT(request: Request) {
  const state = await request.json();
  const savedState = await writeTestState(state);
  return NextResponse.json(savedState);
}

export async function DELETE() {
  const state = await resetTestState();
  return NextResponse.json(state);
}
