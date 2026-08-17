import { randomUUID } from "node:crypto";
import { Prisma, ScheduleStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createCleanRunTestState } from "@/lib/test-state";
import { overwriteWorkspaceBackupWithClient } from "@/lib/workspace-backup";
export { CLEAN_RUN_CONFIRMATION, isCleanRunConfirmation } from "@/lib/uat-reset-shared";

export const CANONICAL_UAT_USERS = [
  { name: "M. Kodithuwakku", email: "m.kodithuwakku803@gmail.com", role: UserRole.manager },
  { name: "Kodithuw UAlberta", email: "kodithuw@ualberta.ca", role: UserRole.employee },
  { name: "M. Kodithuwakku Hockey", email: "m.kodithuwakku.hockey@gmail.com", role: UserRole.employee },
  { name: "Bobby Cazby", email: "bobby.cazby@gmail.com", role: UserRole.employee }
] as const;

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function resetProductionUat(storeId: string) {
  return prisma.$transaction(async (transaction) => {
    const store = await transaction.store.findUnique({
      where: { id: storeId },
      select: { id: true }
    });
    if (!store) throw new Error("The active store no longer exists.");

    // Preserve the current schedule before any destructive clean-run work.
    await overwriteWorkspaceBackupWithClient(transaction, storeId, "pre_reset");

    const [memberships, invitations] = await Promise.all([
      transaction.storeMembership.findMany({
        where: { storeId },
        select: { userId: true, user: { select: { email: true } } }
      }),
      transaction.storeInvitation.findMany({
        where: { storeId },
        select: { email: true }
      })
    ]);

    const candidateEmails = new Set([
      ...CANONICAL_UAT_USERS.map((user) => user.email),
      ...memberships.map((membership) => membership.user.email).filter((email): email is string => Boolean(email)),
      ...invitations.map((invitation) => invitation.email)
    ].map((email) => email.trim().toLowerCase()));
    const candidateUsers = await transaction.user.findMany({
      where: { email: { in: [...candidateEmails] } },
      select: { id: true }
    });
    const candidateUserIds = candidateUsers.map((user) => user.id);

    const removedNotificationLogs = await transaction.notificationLog.deleteMany({ where: { storeId } });
    const removedAuditLogs = await transaction.auditLog.deleteMany({ where: { storeId } });
    const removedInvitations = await transaction.storeInvitation.deleteMany({ where: { storeId } });
    const removedPeriods = await transaction.schedulePeriod.deleteMany({ where: { storeId } });

    const canonicalEmails = new Set(CANONICAL_UAT_USERS.map((user) => user.email));
    await transaction.storeMembership.deleteMany({
      where: {
        storeId,
        user: {
          email: { notIn: [...canonicalEmails] }
        }
      }
    });

    const canonicalUsers: Array<{ id: string; role: UserRole }> = [];
    for (const fixture of CANONICAL_UAT_USERS) {
      const user = await transaction.user.upsert({
        where: { email: fixture.email },
        update: {
          name: fixture.name,
          role: fixture.role,
          active: true
        },
        create: {
          name: fixture.name,
          email: fixture.email,
          role: fixture.role,
          active: true
        },
        select: { id: true, role: true }
      });
      canonicalUsers.push(user);
      await transaction.storeMembership.upsert({
        where: { storeId_userId: { storeId, userId: user.id } },
        update: { role: fixture.role, active: true },
        create: { storeId, userId: user.id, role: fixture.role, active: true }
      });
    }

    const allAuthUserIds = [...new Set([...candidateUserIds, ...canonicalUsers.map((user) => user.id)])];
    const removedSessions = await transaction.session.deleteMany({ where: { userId: { in: allAuthUserIds } } });
    const removedAccounts = await transaction.account.deleteMany({ where: { userId: { in: allAuthUserIds } } });

    const manager = canonicalUsers.find((user) => user.role === UserRole.manager);
    if (!manager) throw new Error("The canonical manager could not be restored.");

    const resetAt = new Date();
    const cleanState = createCleanRunTestState(`uat_${randomUUID()}`, resetAt);
    await transaction.schedulePeriod.create({
      data: {
        id: cleanState.period.id,
        storeId,
        name: cleanState.period.name,
        startDate: new Date(`${cleanState.period.startDate}T12:00:00.000Z`),
        endDate: new Date(`${cleanState.period.endDate}T12:00:00.000Z`),
        releaseDate: new Date(`${cleanState.period.releaseDate}T12:00:00.000Z`),
        availabilityOpenAt: new Date(`${cleanState.period.availabilityOpenAt}T12:00:00.000Z`),
        availabilityDeadlineAt: new Date(`${cleanState.period.availabilityDeadlineAt}T23:59:00.000Z`),
        status: ScheduleStatus.draft,
        createdById: manager.id
      }
    });

    await transaction.storeWorkspaceState.upsert({
      where: { storeId },
      update: {
        data: jsonValue(cleanState),
        version: { increment: 1 }
      },
      create: {
        storeId,
        data: jsonValue(cleanState)
      }
    });

    return {
      resetAt: resetAt.toISOString(),
      restoredUsers: canonicalUsers.length,
      removedAccounts: removedAccounts.count,
      removedSessions: removedSessions.count,
      removedInvitations: removedInvitations.count,
      removedNotificationLogs: removedNotificationLogs.count,
      removedAuditLogs: removedAuditLogs.count,
      removedPeriods: removedPeriods.count
    };
  }, { maxWait: 10_000, timeout: 30_000 });
}
