import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentAccess } from "@/lib/access";
import {
  advanceScheduleTestDate,
  beginNextScheduleCycle,
  nextReminderDate,
  simulatedDateAsEdmontonNoon
} from "@/lib/schedule-progression";
import { sendDueAvailabilityRemindersForStore } from "@/lib/schedule-notifications";
import { overwriteWorkspaceBackup } from "@/lib/workspace-backup";
import { readWorkspaceState, writeWorkspaceState } from "@/lib/workspace-state";

type DayProgressionAction = "start_next_cycle" | "advance_day" | "jump_to_reminder" | "stop_simulation";

export async function POST(request: Request) {
  const access = await getCurrentAccess();
  if (!access) return NextResponse.json({ error: "Sign in with an active employee account." }, { status: 401 });
  if (access.role !== UserRole.manager) {
    return NextResponse.json({ error: "Only active managers can control day-progression testing." }, { status: 403 });
  }

  const body = (await request.json()) as { action?: DayProgressionAction };
  const state = await readWorkspaceState(access.storeId);

  try {
    if (body.action === "start_next_cycle") {
      await overwriteWorkspaceBackup(access.storeId, "manual");
      const nextState = beginNextScheduleCycle(state);
      const savedState = await writeWorkspaceState(access.storeId, nextState);
      return NextResponse.json({
        state: savedState,
        message: `Opened ${savedState.period.name}. The published schedule was preserved in schedule history and the protected backup.`
      });
    }

    if (body.action === "stop_simulation") {
      const nextState = await writeWorkspaceState(access.storeId, {
        ...state,
        dayProgression: { ...state.dayProgression, enabled: false },
        auditLog: [
          {
            id: `audit_day_progression_stopped_${Date.now()}`,
            actorId: "emp_manager",
            action: "simulated_date_stopped",
            entityType: "SchedulePeriod",
            entityId: state.period.id,
            summary: "Returned availability rules to the real Edmonton calendar date.",
            createdAt: new Date().toISOString()
          },
          ...state.auditLog
        ]
      });
      return NextResponse.json({ state: nextState, message: "Day simulation stopped. The current schedule cycle was kept." });
    }

    if (body.action !== "advance_day" && body.action !== "jump_to_reminder") {
      return NextResponse.json({ error: "Choose a valid day-progression action." }, { status: 400 });
    }

    const reminderDate = nextReminderDate(state);
    const targetDate = body.action === "jump_to_reminder" ? reminderDate : undefined;
    const advancedState = advanceScheduleTestDate(state, targetDate);
    await writeWorkspaceState(access.storeId, advancedState);
    const reminderResult = await sendDueAvailabilityRemindersForStore(
      access.storeId,
      simulatedDateAsEdmontonNoon(advancedState.dayProgression.currentDate)
    );
    const finalState = await readWorkspaceState(access.storeId);
    const deliveries = reminderResult?.deliveries ?? [];

    return NextResponse.json({
      state: finalState,
      deliveries: {
        attempted: deliveries.filter((delivery) => !delivery.duplicate).length,
        sent: deliveries.filter((delivery) => delivery.status === "sent" && !delivery.duplicate).length,
        queued: deliveries.filter((delivery) => delivery.status === "queued" && !delivery.duplicate).length,
        failed: deliveries.filter((delivery) => delivery.status === "failed" && !delivery.duplicate).length,
        duplicatesSkipped: deliveries.filter((delivery) => delivery.duplicate).length
      },
      message:
        deliveries.length > 0
          ? `Advanced to ${finalState.dayProgression.currentDate} and processed ${deliveries.length} availability reminder emails.`
          : `Advanced to ${finalState.dayProgression.currentDate}. No schedule email is due on this day.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to advance the schedule test." },
      { status: 409 }
    );
  }
}
