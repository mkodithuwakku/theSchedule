import { openDueScheduleWindows } from "@/lib/schedule-lifecycle";
import { sendDueAvailabilityReminders } from "@/lib/schedule-notifications";
import { overwriteAllWorkspaceBackups } from "@/lib/workspace-backup";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const windows = await openDueScheduleWindows();
  const [backups, storeResults] = await Promise.all([
    overwriteAllWorkspaceBackups(),
    sendDueAvailabilityReminders()
  ]);
  const deliveries = storeResults.flatMap((result) => result.deliveries);
  return Response.json({
    ok: true,
    windows,
    storesProcessed: storeResults.length,
    backups: {
      storesProcessed: backups.length,
      snapshotsWritten: backups.filter((backup) => backup.exists).length
    },
    deliveries: {
      attempted: deliveries.filter((delivery) => !delivery.duplicate).length,
      sent: deliveries.filter((delivery) => delivery.status === "sent" && !delivery.duplicate).length,
      queued: deliveries.filter((delivery) => delivery.status === "queued" && !delivery.duplicate).length,
      failed: deliveries.filter((delivery) => delivery.status === "failed" && !delivery.duplicate).length,
      duplicatesSkipped: deliveries.filter((delivery) => delivery.duplicate).length
    }
  });
}
