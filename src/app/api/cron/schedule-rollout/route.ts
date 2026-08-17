import { sendDueAvailabilityReminders } from "@/lib/schedule-notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storeResults = await sendDueAvailabilityReminders();
  const deliveries = storeResults.flatMap((result) => result.deliveries);
  return Response.json({
    ok: true,
    storesProcessed: storeResults.length,
    deliveries: {
      attempted: deliveries.filter((delivery) => !delivery.duplicate).length,
      sent: deliveries.filter((delivery) => delivery.status === "sent" && !delivery.duplicate).length,
      queued: deliveries.filter((delivery) => delivery.status === "queued" && !delivery.duplicate).length,
      failed: deliveries.filter((delivery) => delivery.status === "failed" && !delivery.duplicate).length,
      duplicatesSkipped: deliveries.filter((delivery) => delivery.duplicate).length
    }
  });
}
