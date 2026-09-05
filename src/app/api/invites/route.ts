import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentAccess } from "@/lib/access";
import { buildInvitationUrl, getAppBaseUrl } from "@/lib/app-url";
import { employeeInviteEmail, sendScheduleEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

type InviteRequest = {
  email?: string;
  name?: string;
  storeId?: string;
};

type EditInviteRequest = InviteRequest & {
  currentEmail?: string;
};

const INVITATION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 14;

class InviteActionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "InviteActionError";
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function requireEmail(email?: string) {
  const normalized = email ? normalizeEmail(email) : "";
  if (!normalized || !normalized.includes("@")) {
    throw new InviteActionError("A valid email is required.", 400);
  }
  return normalized;
}

async function requireManager(storeId?: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId ?? "store_wem" },
  });
  if (!store) {
    throw new InviteActionError("Store is not configured. Run the Prisma seed before sending invites.", 500);
  }

  const access = await getCurrentAccess(store.id);
  if (!access) throw new InviteActionError("Sign in with an active employee account.", 401);
  if (access.role !== UserRole.manager) {
    throw new InviteActionError("Only active managers can manage employee invites.", 403);
  }

  return { access, store };
}

async function deliverInvitation(
  request: Request,
  invitation: { id: string; email: string; token: string; storeId: string },
  inviteeId: string,
) {
  const inviteUrl = buildInvitationUrl(getAppBaseUrl(request), invitation.token);
  const message = employeeInviteEmail(inviteUrl);
  const provider = await sendScheduleEmail({
    to: invitation.email,
    subject: message.subject,
    html: message.html,
  });

  await prisma.notificationLog.create({
    data: {
      storeId: invitation.storeId,
      userId: inviteeId,
      type: "employee_invited",
      subject: message.subject,
      status: provider.status,
      sentAt: provider.status === "sent" ? new Date() : undefined,
      providerId: provider.providerId,
      failureReason: provider.reason,
      metadataJson: {
        inviteId: invitation.id,
        providerId: provider.providerId,
        reason: provider.reason,
      },
    },
  });

  return { inviteUrl, provider };
}

function errorResponse(error: unknown) {
  if (error instanceof InviteActionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[api/invites] Invitation action failed", error);
  return NextResponse.json({ error: "Unable to manage the employee invitation." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InviteRequest;
    const email = requireEmail(body.email);
    const name = body.name?.trim();
    const { access, store } = await requireManager(body.storeId);

    const invitee = await prisma.user.upsert({
      where: { email },
      update: {
        name: name || undefined,
        role: UserRole.employee,
        active: true,
      },
      create: {
        name: name || email,
        email,
        role: UserRole.employee,
        active: true,
      },
    });

    const invitation = await prisma.storeInvitation.create({
      data: {
        storeId: store.id,
        email,
        role: UserRole.employee,
        token: randomBytes(32).toString("hex"),
        invitedById: access.userId,
        expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
      },
    });

    const { inviteUrl, provider } = await deliverInvitation(request, invitation, invitee.id);

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        inviteUrl,
      },
      notification: {
        status: provider.status,
        reason: provider.reason,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as EditInviteRequest;
    const currentEmail = requireEmail(body.currentEmail);
    const email = requireEmail(body.email);
    const name = body.name?.trim();
    if (!name) throw new InviteActionError("Employee name is required.", 400);
    const { access, store } = await requireManager(body.storeId);

    const updated = await prisma.$transaction(async (transaction) => {
      const invitation = await transaction.storeInvitation.findFirst({
        where: {
          storeId: store.id,
          email: currentEmail,
          acceptedAt: null,
        },
        orderBy: { createdAt: "desc" },
      });
      if (!invitation) {
        throw new InviteActionError("This employee no longer has a pending invitation.", 409);
      }

      if (email !== currentEmail) {
        const [duplicateInvitation, activeMembership] = await Promise.all([
          transaction.storeInvitation.findFirst({
            where: {
              storeId: store.id,
              email,
              acceptedAt: null,
              id: { not: invitation.id },
            },
            select: { id: true },
          }),
          transaction.storeMembership.findFirst({
            where: {
              storeId: store.id,
              active: true,
              user: { email },
            },
            select: { id: true },
          }),
        ]);
        if (duplicateInvitation || activeMembership) {
          throw new InviteActionError("That Gmail account is already approved or invited.", 409);
        }
      }

      const currentInvitee = await transaction.user.findUnique({
        where: { email: currentEmail },
        select: {
          id: true,
          accounts: { select: { id: true }, take: 1 },
          sessions: { select: { id: true }, take: 1 },
          memberships: { select: { id: true }, take: 1 },
        },
      });
      const targetInvitee =
        email === currentEmail
          ? currentInvitee
          : await transaction.user.findUnique({ where: { email }, select: { id: true } });
      const canRenameCurrentInvitee = Boolean(
        currentInvitee &&
          currentInvitee.accounts.length === 0 &&
          currentInvitee.sessions.length === 0 &&
          currentInvitee.memberships.length === 0,
      );

      const invitee = targetInvitee
        ? await transaction.user.update({
            where: { id: targetInvitee.id },
            data: { name, role: UserRole.employee, active: true },
          })
        : currentInvitee && canRenameCurrentInvitee
          ? await transaction.user.update({
              where: { id: currentInvitee.id },
              data: { email, name, role: UserRole.employee, active: true },
            })
          : await transaction.user.create({
              data: { email, name, role: UserRole.employee, active: true },
            });

      const nextInvitation = await transaction.storeInvitation.update({
        where: { id: invitation.id },
        data: { email },
      });

      await transaction.auditLog.create({
        data: {
          storeId: store.id,
          actorUserId: access.userId,
          action: "invite_updated",
          entityType: "StoreInvitation",
          entityId: invitation.id,
          beforeJson: { email: currentEmail },
          afterJson: { email, name },
        },
      });

      return { invitation: nextInvitation, invitee };
    });

    return NextResponse.json({
      invitation: {
        id: updated.invitation.id,
        email: updated.invitation.email,
        expiresAt: updated.invitation.expiresAt,
      },
      employee: {
        name: updated.invitee.name ?? name,
        email: updated.invitee.email ?? email,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as InviteRequest;
    const email = requireEmail(body.email);
    const { access, store } = await requireManager(body.storeId);

    const invitation = await prisma.storeInvitation.findFirst({
      where: {
        storeId: store.id,
        email,
        acceptedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!invitation) {
      throw new InviteActionError("This employee no longer has a pending invitation.", 409);
    }

    const invitee = await prisma.user.upsert({
      where: { email },
      update: { role: UserRole.employee, active: true },
      create: { email, name: body.name?.trim() || email, role: UserRole.employee, active: true },
    });
    const refreshedInvitation = await prisma.storeInvitation.update({
      where: { id: invitation.id },
      data: {
        token: randomBytes(32).toString("hex"),
        expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
        invitedById: access.userId,
      },
    });
    const { provider } = await deliverInvitation(request, refreshedInvitation, invitee.id);

    await prisma.auditLog.create({
      data: {
        storeId: store.id,
        actorUserId: access.userId,
        action: "invite_resent",
        entityType: "StoreInvitation",
        entityId: refreshedInvitation.id,
        afterJson: {
          email: refreshedInvitation.email,
          expiresAt: refreshedInvitation.expiresAt.toISOString(),
          status: provider.status,
        },
      },
    });

    return NextResponse.json({
      invitation: {
        id: refreshedInvitation.id,
        email: refreshedInvitation.email,
        expiresAt: refreshedInvitation.expiresAt,
      },
      notification: {
        status: provider.status,
        reason: provider.reason,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
