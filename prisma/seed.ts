import { PrismaClient, ScheduleStatus, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const managerEmail = process.env.SEED_MANAGER_EMAIL ?? "m.kodithuwakku803@gmail.com";

const employees = [
  { name: "M. Kodithuwakku", email: managerEmail, role: UserRole.manager },
  { name: "Kodithuw UAlberta", email: "kodithuw@ualberta.ca", role: UserRole.employee },
  { name: "M. Kodithuwakku Hockey", email: "m.kodithuwakku.hockey@gmail.com", role: UserRole.employee },
  { name: "Bobby Cazby", email: "bobby.cazby@gmail.com", role: UserRole.employee }
];

const storeHours = [
  ["Monday", 1, "10:00", "21:00"],
  ["Tuesday", 2, "10:00", "21:00"],
  ["Wednesday", 3, "10:00", "21:00"],
  ["Thursday", 4, "10:00", "21:00"],
  ["Friday", 5, "10:00", "21:00"],
  ["Saturday", 6, "10:00", "21:00"],
  ["Sunday", 0, "11:00", "18:00"]
] as const;

const templates = [
  ["weekday", "Open", "09:45", "15:45"],
  ["weekday", "Close", "15:15", "21:15"],
  ["weekend", "Open", "09:45", "15:45"],
  ["weekend", "Mid", "12:00", "18:00"],
  ["weekend", "Close", "15:15", "21:15"],
  ["sunday", "Sunday Open", "10:45", "14:45"],
  ["sunday", "Sunday Close", "14:15", "18:15"]
] as const;

async function main() {
  const store = await prisma.store.upsert({
    where: { id: "store_wem" },
    update: {},
    create: {
      id: "store_wem",
      name: "Men Are From Mars",
      timezone: "America/Edmonton"
    }
  });

  const users = await Promise.all(
    employees.map((employee) =>
      prisma.user.upsert({
        where: { email: employee.email },
        update: { name: employee.name, role: employee.role, active: true },
        create: {
          name: employee.name,
          email: employee.email,
          role: employee.role,
          active: true
        }
      })
    )
  );

  await Promise.all(
    users.map((user) =>
      prisma.storeMembership.upsert({
        where: { storeId_userId: { storeId: store.id, userId: user.id } },
        update: { role: user.role, active: true },
        create: {
          storeId: store.id,
          userId: user.id,
          role: user.role,
          active: true
        }
      })
    )
  );

  await Promise.all(
    storeHours.map(([label, dayOfWeek, openTime, closeTime]) =>
      prisma.storeHours.upsert({
        where: { storeId_dayOfWeek: { storeId: store.id, dayOfWeek } },
        update: { openTime, closeTime, label: `${label} mall hours`, active: true },
        create: { storeId: store.id, dayOfWeek, openTime, closeTime, label: `${label} mall hours` }
      })
    )
  );

  await prisma.shiftTemplate.deleteMany({ where: { storeId: store.id } });
  await prisma.shiftTemplate.createMany({
    data: templates.map(([dayPattern, name, startTime, endTime]) => ({
      storeId: store.id,
      dayPattern,
      name,
      startTime,
      endTime
    }))
  });

  const manager = users[0];
  const period = await prisma.schedulePeriod.upsert({
    where: { id: "period_next" },
    update: {},
    create: {
      id: "period_next",
      storeId: store.id,
      name: "July 15-31, 2026",
      startDate: new Date("2026-07-15T06:00:00.000Z"),
      endDate: new Date("2026-07-31T06:00:00.000Z"),
      releaseDate: new Date("2026-07-14T16:00:00.000Z"),
      availabilityOpenAt: new Date("2026-07-06T16:00:00.000Z"),
      availabilityDeadlineAt: new Date("2026-07-12T23:59:00.000Z"),
      status: ScheduleStatus.draft,
      createdById: manager.id
    }
  });

  await prisma.availabilitySubmission.createMany({
    data: [
      {
        schedulePeriodId: period.id,
        userId: users[1].id,
        submittedAt: new Date(),
        note: "Class in the morning."
      },
      {
        schedulePeriodId: period.id,
        userId: users[2].id,
        submittedAt: new Date(),
        note: "Away for family plans."
      }
    ],
    skipDuplicates: true
  });

  await prisma.auditLog.create({
    data: {
      storeId: store.id,
      actorUserId: manager.id,
      action: "seed_created",
      entityType: "Store",
      entityId: store.id,
      afterJson: { message: "Seeded The Schedule sample store" }
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
