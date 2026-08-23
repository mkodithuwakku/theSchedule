import { getServerSession } from "next-auth";
import { AccessScreen } from "@/components/access-screen";
import { TheScheduleApp } from "@/components/the-schedule-app";
import { getCurrentAccess, normalizeEmail } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { canUseMobileEmployeePreview } from "@/lib/mobile-preview";
import { prisma } from "@/lib/prisma";
import { employees, store } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ employeePreview?: string; error?: string }>;
}) {
  const { employeePreview, error } = await searchParams;
  const mobilePreviewAllowed = canUseMobileEmployeePreview();

  if (mobilePreviewAllowed && employeePreview === "1") {
    const previewEmployee = employees.find(
      (employee) => employee.id === "emp_ualberta",
    );

    if (previewEmployee) {
      return (
        <TheScheduleApp
          activeMemberEmails={employees.map((employee) => employee.email)}
          currentUser={{
            email: previewEmployee.email,
            image: null,
            name: previewEmployee.name,
            role: "employee",
            storeId: store.id,
            userId: previewEmployee.id,
          }}
          previewMode
        />
      );
    }
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return (
      <AccessScreen
        allowEmployeePreview={mobilePreviewAllowed}
        authError={error}
      />
    );

  const access = await getCurrentAccess();
  if (!access)
    return (
      <AccessScreen
        allowEmployeePreview={mobilePreviewAllowed}
        signedInEmail={normalizeEmail(session.user.email)}
      />
    );

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
      activeMemberEmails={activeMemberEmails}
    />
  );
}
