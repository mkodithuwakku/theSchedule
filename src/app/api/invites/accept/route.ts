import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAppBaseUrl } from "@/lib/app-url";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, getAppBaseUrl(request)));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) return redirectTo(request, "/?invite=missing");

  const invitation = await prisma.storeInvitation.findUnique({
    where: { token },
    include: { store: true }
  });

  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    return redirectTo(request, "/?invite=invalid");
  }

  const session = await getServerSession(authOptions);
  const sessionEmail = session?.user?.email ? normalizeEmail(session.user.email) : null;

  if (!sessionEmail) {
    const callbackUrl = `${getAppBaseUrl(request)}/api/invites/accept?token=${encodeURIComponent(token)}`;
    return redirectTo(request, `/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  if (sessionEmail !== normalizeEmail(invitation.email)) {
    return redirectTo(request, "/?invite=email-mismatch");
  }

  const user = await prisma.user.upsert({
    where: { email: sessionEmail },
    update: {
      role: invitation.role,
      active: true
    },
    create: {
      email: sessionEmail,
      name: session?.user?.name ?? invitation.email,
      role: invitation.role,
      active: true
    }
  });

  await prisma.storeMembership.upsert({
    where: {
      storeId_userId: {
        storeId: invitation.storeId,
        userId: user.id
      }
    },
    update: {
      role: invitation.role,
      active: true
    },
    create: {
      storeId: invitation.storeId,
      userId: user.id,
      role: invitation.role,
      active: true
    }
  });

  await prisma.storeInvitation.update({
    where: { id: invitation.id },
    data: {
      acceptedById: user.id,
      acceptedAt: new Date()
    }
  });

  await prisma.auditLog.create({
    data: {
      storeId: invitation.storeId,
      actorUserId: user.id,
      action: "invite_accepted",
      entityType: "StoreInvitation",
      entityId: invitation.id,
      afterJson: {
        email: invitation.email,
        storeName: invitation.store.name
      }
    }
  });

  return redirectTo(request, "/?invite=accepted");
}
