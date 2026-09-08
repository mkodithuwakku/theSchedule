import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resetProductionUat } from "@/lib/uat-reset";
import { createDefaultTestState } from "@/lib/test-state";

// Run the actual reset transaction against controlled records, including a custom
// employee and a user belonging to another store. Never connects to Neon.
test("clean reset retains only the owner membership, deletes orphaned employees, and creates no schedule rows", async (t) => {
  const owner = { id: "owner", email: "m.kodithuwakku803@gmail.com", role: UserRole.manager };
  const users = [owner,
    { id: "ualberta", email: "kodithuw@ualberta.ca", role: UserRole.employee },
    { id: "extra", email: "extra@example.com", role: UserRole.employee },
    { id: "shared", email: "shared@example.com", role: UserRole.employee }
  ];
  let members = users.map((user) => ({ userId: user.id, user }));
  let saved: ReturnType<typeof createDefaultTestState> | undefined;
  const deletedUsers: string[] = [];
  const deletedAuth: string[] = [];
  let createdPeriods = 0;
  let backupWritten = false;
  const removed = async () => ({ count: 1 });
  const transaction = {
    store: { findUnique: async () => ({ id: "store_test" }) },
    storeMembership: {
      findMany: async () => members,
      deleteMany: async (args: { where: { user: { email: { notIn: string[] } } } }) => {
        members = members.filter((member) => args.where.user.email.notIn.includes(member.user.email));
        return { count: 3 };
      },
      upsert: async (args: { create: { userId: string; role: string; active: boolean } }) => {
        assert.equal(args.create.userId, owner.id);
        assert.equal(args.create.role, "manager");
        assert.equal(args.create.active, true);
      }
    },
    user: {
      findMany: async () => users,
      upsert: async (args: { where: { email: string } }) => {
        assert.equal(args.where.email, owner.email);
        return owner;
      },
      deleteMany: async (args: { where: { id: { in: string[] }; memberships: { none: object } } }) => {
        assert.deepEqual(args.where.memberships, { none: {} });
        deletedUsers.push(...args.where.id.in.filter((id) => id !== "shared"));
        return { count: deletedUsers.length };
      }
    },
    storeInvitation: { findMany: async () => [], deleteMany: removed },
    notificationLog: { deleteMany: removed }, auditLog: { deleteMany: removed },
    schedulePeriod: { deleteMany: removed, create: async () => { createdPeriods++; } },
    session: { deleteMany: async (args: { where: { userId: { in: string[] } } }) => { deletedAuth.push(...args.where.userId.in); return { count: 4 }; } },
    account: { deleteMany: removed },
    storeWorkspaceState: {
      findUnique: async () => ({ data: createDefaultTestState("old_run"), version: 9, updatedAt: new Date() }),
      upsert: async (args: { update: { data: typeof saved; version: { increment: number } } }) => {
        assert(backupWritten, "backup must precede destruction");
        saved = args.update.data;
        assert.equal(args.update.version.increment, 1);
      }
    },
    storeWorkspaceBackup: { upsert: async (args: { create: Record<string, unknown> }) => {
      backupWritten = true;
      return { ...args.create, restoredAt: null, restoreCount: 0 };
    } }
  };
  const original = prisma.$transaction;
  prisma.$transaction = (async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => callback(transaction as unknown as Prisma.TransactionClient)) as typeof original;
  t.after(() => { prisma.$transaction = original; });

  const result = await resetProductionUat("store_test");
  assert.deepEqual(members.map((m) => m.userId), [owner.id]);
  assert.deepEqual(deletedUsers.sort(), ["extra", "ualberta"]);
  assert(deletedAuth.includes(owner.id));
  assert.equal(createdPeriods, 0);
  assert.equal(result.activeUsers, 1);
  assert.equal(result.awaitingInvitationUsers, 0);
  assert(saved);
  assert.deepEqual(saved.people.map((p) => p.email), [owner.email]);
  assert.deepEqual(saved.shifts, []);
  assert.deepEqual(saved.scheduleHistory, []);
  assert.notEqual(saved.uatRunId, "old_run");
});
