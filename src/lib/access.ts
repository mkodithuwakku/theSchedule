import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AppAccess } from "@/lib/access-shared";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getCurrentAccess(storeId?: string): Promise<AppAccess | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ? normalizeEmail(session.user.email) : null;
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      active: true,
      memberships: {
        where: {
          active: true,
          ...(storeId ? { storeId } : {})
        },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          storeId: true,
          role: true
        }
      }
    }
  });

  const membership = user?.memberships[0];
  if (!user?.active || !user.email || !membership) return null;

  return {
    userId: user.id,
    storeId: membership.storeId,
    name: user.name?.trim() || user.email,
    email: normalizeEmail(user.email),
    image: user.image,
    role: membership.role
  };
}
