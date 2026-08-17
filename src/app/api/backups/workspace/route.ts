import { NextResponse } from "next/server";
import { getCurrentAccess } from "@/lib/access";
import {
  overwriteWorkspaceBackup,
  readWorkspaceBackupStatus,
  restoreWorkspaceBackup,
  WorkspaceBackupIntegrityError,
  WorkspaceBackupNotFoundError
} from "@/lib/workspace-backup";
import { isRestoreWorkspaceConfirmation } from "@/lib/workspace-backup-shared";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Sign in with an active employee account." }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Only active managers can manage schedule backups." }, { status: 403 });
}

async function managerAccess() {
  const access = await getCurrentAccess();
  if (!access) return { response: unauthorized() } as const;
  if (access.role !== "manager") return { response: forbidden() } as const;
  return { access } as const;
}

export async function GET() {
  const result = await managerAccess();
  if ("response" in result) return result.response;

  const backup = await readWorkspaceBackupStatus(result.access.storeId);
  return NextResponse.json({ backup }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  const result = await managerAccess();
  if ("response" in result) return result.response;

  const backup = await overwriteWorkspaceBackup(result.access.storeId, "manual");
  return NextResponse.json({ ok: true, backup });
}

export async function PUT(request: Request) {
  const result = await managerAccess();
  if ("response" in result) return result.response;

  const body = (await request.json().catch(() => ({}))) as { confirmation?: string };
  if (!isRestoreWorkspaceConfirmation(body.confirmation)) {
    return NextResponse.json({ error: "Enter the exact restore confirmation phrase." }, { status: 400 });
  }

  try {
    const restored = await restoreWorkspaceBackup(result.access.storeId);
    return NextResponse.json({ ok: true, ...restored });
  } catch (error) {
    if (error instanceof WorkspaceBackupNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof WorkspaceBackupIntegrityError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
