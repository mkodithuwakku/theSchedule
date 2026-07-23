import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { getAppBaseUrl } from "@/lib/app-url";
import { authOptions } from "@/lib/auth";
import { employeeInviteEmail, sendScheduleEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

type InviteRequest = {
  email?: string;
  name?: string;
  storeId?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(request: Request) {
  const body = (await request.json()) as InviteRequest;
  const email = body.email ? normalizeEmail(body.email) : "";
  const name = body.name?.trim();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const store = await prisma.store.findUnique({
    where: { id: body.storeId ?? "store_wem" }
  });

  if (!store) {
    return NextResponse.json({ error: "Store is not configured. Run the Prisma seed before sending invites." }, { status: 500 });
  }

  const session = await getServerSession(authOptions);
  const sessionEmail = session?.user?.email ? normalizeEmail(session.user.email) : null;
  const sessionUser = sessionEmail
    ? await prisma.user.findUnique({
        where: { email: sessionEmail }
      })
    : null;

  const managerMembership = sessionUser
    ? await prisma.storeMembership.findFirst({
        where: {
          storeId: store.id,
          userId: sessionUser.id,
          role: UserRole.manager,
          active: true
        }
      })
    : null;

  if (process.env.NODE_ENV === "production" && !managerMembership) {
    return NextResponse.json({ error: "Only active managers can send production invites." }, { status: 403 });
  }

  const developmentManager =
    sessionUser ??
    (await prisma.user.findFirst({
      where: {
        memberships: {
          some: {
            storeId: store.id,
            role: UserRole.manager,
            active: true
          }
        }
      }
    }));

  const invitee = await prisma.user.upsert({
    where: { email },
    update: {
      name: name || undefined,
      role: UserRole.employee,
      active: true
    },
    create: {
      name: name || email,
      email,
      role: UserRole.employee,
      active: true
    }
  });

  const invitation = await prisma.storeInvitation.create({
    data: {
      storeId: store.id,
      email,
      role: UserRole.employee,
      token: randomBytes(32).toString("hex"),
      invitedById: developmentManager?.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });

  const inviteUrl = `${getAppBaseUrl(request)}/api/invites/accept?token=${invitation.token}`;
  const message = employeeInviteEmail(store.name, inviteUrl, developmentManager?.name ?? "Your manager");
  const provider = await sendScheduleEmail({
    to: email,
    subject: message.subject,
    html: message.html
  });

  await prisma.notificationLog.create({
    data: {
      storeId: store.id,
      userId: invitee.id,
      type: "employee_invited",
      subject: message.subject,
      status: provider.status,
      sentAt: provider.status === "sent" ? new Date() : undefined,
      metadataJson: {
        inviteId: invitation.id,
        providerId: provider.providerId,
        reason: provider.reason
      }
    }
  });

  return NextResponse.json({
    invitation: {
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      inviteUrl
    },
    notification: {
      status: provider.status,
      reason: provider.reason
    }
  });
}
