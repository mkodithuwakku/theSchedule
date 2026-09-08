import { DEFAULT_MANAGERS } from "@/lib/default-managers";
import { randomUUID } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CLEAN_RUN_ACTIVE_EMAILS, createCleanRunTestState } from "@/lib/test-state";
import { overwriteWorkspaceBackupWithClient } from "@/lib/workspace-backup";
export { CLEAN_RUN_CONFIRMATION, isCleanRunConfirmation } from "@/lib/uat-reset-shared";

export const CANONICAL_UAT_USERS = DEFAULT_MANAGERS.map(({ name, email }) => ({ name, email, role: UserRole.manager }));

const cleanRunActiveEmailSet = new Set<string>(CLEAN_RUN_ACTIVE_EMAILS);

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
      select: { id: true, email: true }
    });
    const candidateUserIds = candidateUsers.map((user) => user.id);

    const removedNotificationLogs = await transaction.notificationLog.deleteMany({ where: { storeId } });
    const removedAuditLogs = await transaction.auditLog.deleteMany({ where: { storeId } });
    const removedInvitations = await transaction.storeInvitation.deleteMany({ where: { storeId } });
    const removedPeriods = await transaction.schedulePeriod.deleteMany({ where: { storeId } });

    // The default managers survive a clean run. Every other
    // membership from this store is removed before orphaned UAT users are deleted.
    await transaction.storeMembership.deleteMany({
      where: {
        storeId,
        user: {
          email: { notIn: [...CLEAN_RUN_ACTIVE_EMAILS] }
        }
      }
    });

    const canonicalUsers: Array<{ id: string; role: UserRole }> = [];
    for (const fixture of CANONICAL_UAT_USERS.filter((user) => cleanRunActiveEmailSet.has(user.email))) {
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

    const removableUserIds = candidateUsers
      .filter((user) => user.email && !cleanRunActiveEmailSet.has(user.email.trim().toLowerCase()))
      .map((user) => user.id);
    const removedUsers = await transaction.user.deleteMany({
      where: {
        id: { in: removableUserIds },
        memberships: { none: {} }
      }
    });

    const manager = canonicalUsers.find((user) => user.role === UserRole.manager);
    if (!manager) throw new Error("The canonical manager could not be restored.");

    const resetAt = new Date();
    const cleanState = createCleanRunTestState(`uat_${randomUUID()}`, resetAt);
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
      activeUsers: CLEAN_RUN_ACTIVE_EMAILS.length,
      awaitingInvitationUsers: 0,
      removedUsers: removedUsers.count,
      removedAccounts: removedAccounts.count,
      removedSessions: removedSessions.count,
      removedInvitations: removedInvitations.count,
      removedNotificationLogs: removedNotificationLogs.count,
      removedAuditLogs: removedAuditLogs.count,
      removedPeriods: removedPeriods.count
    };
  }, { maxWait: 10_000, timeout: 30_000 });
}
