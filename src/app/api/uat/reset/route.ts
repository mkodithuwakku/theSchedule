import { NextResponse } from "next/server";
import { getCurrentAccess } from "@/lib/access";
import { resetProductionUat } from "@/lib/uat-reset";
import { isCleanRunConfirmation } from "@/lib/uat-reset-shared";

type ResetRequest = {
  confirmation?: string;
};

export async function POST(request: Request) {
  const access = await getCurrentAccess();
  if (!access) return NextResponse.json({ error: "Sign in with an active employee account." }, { status: 401 });
  if (access.role !== "manager") {
    return NextResponse.json({ error: "Only active managers can reset production UAT." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as ResetRequest;
  if (!isCleanRunConfirmation(body.confirmation)) {
    return NextResponse.json({ error: "Enter the exact clean-run confirmation phrase." }, { status: 400 });
  }

  const result = await resetProductionUat(access.storeId);
  return NextResponse.json({ ok: true, ...result });
}
