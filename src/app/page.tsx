import type { Route } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AccessScreen } from "@/components/access-screen";
import { TheScheduleApp } from "@/components/the-schedule-app";
import { getCurrentAccess, normalizeEmail } from "@/lib/access";
import { getAppBaseUrl } from "@/lib/app-url";
import { authOptions } from "@/lib/auth";
import { normalizeAuthCallbackUrl } from "@/lib/auth-callback";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string | string[];
    error?: string;
  }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const safeCallbackUrl = normalizeAuthCallbackUrl(
    callbackUrl,
    getAppBaseUrl(),
  );
  const session = await getServerSession(authOptions);
  if (
    session?.user?.email &&
    safeCallbackUrl.startsWith("/api/invites/accept?token=")
  ) {
    redirect(safeCallbackUrl as Route);
  }
  if (!session?.user?.email)
    return <AccessScreen authError={error} callbackUrl={safeCallbackUrl} />;

  const access = await getCurrentAccess();
  if (!access)
    return <AccessScreen signedInEmail={normalizeEmail(session.user.email)} />;

  const memberships = await prisma.storeMembership.findMany({
    where: { storeId: access.storeId, active: true, user: { active: true } },
    select: { user: { select: { email: true } } },
  });
  const activeMemberEmails = memberships
    .map((membership) => membership.user.email)
    .filter((email): email is string => Boolean(email))
    .map(normalizeEmail);

  return (
    <TheScheduleApp
      currentUser={access}
      activeMemberEmails={access.role === "manager" ? activeMemberEmails : [access.email]}
    />
  );
}
