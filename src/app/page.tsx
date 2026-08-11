import { getServerSession } from "next-auth";
import { AccessScreen } from "@/components/access-screen";
import { TheScheduleApp } from "@/components/the-schedule-app";
import { getCurrentAccess, normalizeEmail } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return <AccessScreen />;

  const access = await getCurrentAccess();
  if (!access) return <AccessScreen signedInEmail={normalizeEmail(session.user.email)} />;

  const memberships = await prisma.storeMembership.findMany({
    where: { storeId: access.storeId, active: true, user: { active: true } },
    select: { user: { select: { email: true } } }
  });
  const activeMemberEmails = memberships
    .map((membership) => membership.user.email)
    .filter((email): email is string => Boolean(email))
    .map(normalizeEmail);

  return <TheScheduleApp currentUser={access} activeMemberEmails={activeMemberEmails} />;
}
