import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultTestState } from "../src/lib/test-state";
import {
  activeRolloutRecipients,
  availabilityReminderDate,
  buildAvailabilityReminderPlans,
  buildPublishedSchedulePlans,
  dateInTimeZone,
  dispatchNotificationPlans,
  isAvailabilityReminderDue,
  type NotificationPlan,
  type NotificationProviderResult,
  type RolloutMember
} from "../src/lib/schedule-rollout";

const timeZone = "America/Edmonton";
const manager: RolloutMember = {
  userId: "db_manager",
  name: "Manager",
  email: "m.kodithuwakku803@gmail.com",
  active: true
};
const employee: RolloutMember = {
  userId: "db_employee",
  name: "Employee",
  email: "kodithuw@ualberta.ca",
  active: true
};

function rolloutState() {
  const state = createDefaultTestState();
  state.period = {
    ...state.period,
    id: "period_august",
    name: "August 20-31, 2026",
    releaseDate: "2026-08-20",
    availabilityOpenAt: "2026-08-12",
    availabilityDeadlineAt: "2026-08-18",
    status: "draft",
    publishedAt: undefined
  };
  return state;
}

test("availability reminder is due exactly three Edmonton calendar days before release", () => {
  const state = rolloutState();
  assert.equal(availabilityReminderDate(state.period.releaseDate), "2026-08-17");
  assert.equal(isAvailabilityReminderDue(state.period, new Date("2026-08-17T16:00:00.000Z"), timeZone), true);
  assert.equal(isAvailabilityReminderDue(state.period, new Date("2026-08-16T16:00:00.000Z"), timeZone), false);
  assert.equal(isAvailabilityReminderDue(state.period, new Date("2026-08-18T16:00:00.000Z"), timeZone), false);
});

test("Edmonton date calculation follows local midnight across daylight-saving time", () => {
  assert.equal(dateInTimeZone(new Date("2026-03-08T06:30:00.000Z"), timeZone), "2026-03-07");
  assert.equal(dateInTimeZone(new Date("2026-03-08T07:30:00.000Z"), timeZone), "2026-03-08");
  assert.equal(dateInTimeZone(new Date("2026-11-01T07:30:00.000Z"), timeZone), "2026-11-01");
});

test("reminders include only active members with active workspace profiles", () => {
  const state = rolloutState();
  const inactiveMember = { ...employee, userId: "inactive_member", active: false };
  const unknownMember = { ...employee, userId: "unknown", email: "unknown@gmail.com" };
  state.people = state.people.map((person) =>
    person.email === "m.kodithuwakku.hockey@gmail.com" ? { ...person, active: false } : person
  );

  const recipients = activeRolloutRecipients(state, [manager, employee, inactiveMember, unknownMember]);
  assert.deepEqual(recipients.map((recipient) => recipient.userId), [manager.userId, employee.userId]);

  const plans = buildAvailabilityReminderPlans({
    storeId: "store_wem",
    timeZone,
    state,
    members: [manager, employee, inactiveMember, unknownMember],
    appUrl: "https://mafm-schedule.vercel.app",
    now: new Date("2026-08-17T16:00:00.000Z")
  });
  assert.equal(plans.length, 2);
  assert.equal(new Set(plans.map((plan) => plan.dedupKey)).size, 2);
  assert.ok(plans.every((plan) => plan.html.includes("Submit availability")));
});

test("published schedule creates one consolidated email per active member", () => {
  const state = rolloutState();
  const managerPerson = state.people.find((person) => person.email === manager.email);
  const employeePerson = state.people.find((person) => person.email === employee.email);
  assert.ok(managerPerson);
  assert.ok(employeePerson);
  state.period.status = "published";
  state.shifts = [
    {
      id: "shift_one",
      schedulePeriodId: state.period.id,
      date: "2026-08-21",
      startTime: "09:45",
      endTime: "15:45",
      employeeId: managerPerson.id
    },
    {
      id: "shift_two",
      schedulePeriodId: state.period.id,
      date: "2026-08-23",
      startTime: "14:15",
      endTime: "18:15",
      employeeId: managerPerson.id
    }
  ];

  const plans = buildPublishedSchedulePlans({
    storeId: "store_wem",
    timeZone,
    state,
    members: [manager, employee],
    appUrl: "https://mafm-schedule.vercel.app"
  });
  assert.equal(plans.length, 2);
  const managerPlan = plans.find((plan) => plan.userId === manager.userId);
  const employeePlan = plans.find((plan) => plan.userId === employee.userId);
  assert.ok(managerPlan);
  assert.ok(employeePlan);
  assert.match(managerPlan.html, /Friday, August 21, 2026/);
  assert.match(managerPlan.html, /Sunday, August 23, 2026/);
  assert.match(employeePlan.html, /do not currently have any assigned shifts/);
});

test("database claim prevents a retry from sending the same notification twice", async () => {
  const state = rolloutState();
  const [plan] = buildAvailabilityReminderPlans({
    storeId: "store_wem",
    timeZone,
    state,
    members: [manager],
    appUrl: "https://mafm-schedule.vercel.app",
    now: new Date("2026-08-17T16:00:00.000Z")
  });
  const claimed = new Set<string>();
  const completed: NotificationProviderResult[] = [];
  let sendCount = 0;
  const dispatcher = {
    async claim(candidate: NotificationPlan) {
      if (claimed.has(candidate.dedupKey)) return { claimed: false as const, status: "sent" as const };
      claimed.add(candidate.dedupKey);
      return { claimed: true as const };
    },
    async send() {
      sendCount += 1;
      return { status: "sent" as const, providerId: "resend_123", reason: null };
    },
    async complete(_candidate: NotificationPlan, result: NotificationProviderResult) {
      completed.push(result);
    }
  };

  const first = await dispatchNotificationPlans([plan], dispatcher);
  const retry = await dispatchNotificationPlans([plan], dispatcher);
  assert.equal(sendCount, 1);
  assert.equal(completed.length, 1);
  assert.equal(first[0].providerId, "resend_123");
  assert.equal(retry[0].duplicate, true);
});

test("provider failures are completed as failed delivery records", async () => {
  const plan: NotificationPlan = {
    dedupKey: "failure-test",
    storeId: "store_wem",
    userId: manager.userId,
    workspacePersonId: "emp_manager",
    recipientName: manager.name,
    to: manager.email,
    type: "availability_reminder",
    subject: "Reminder",
    html: "<p>Reminder</p>",
    metadata: {}
  };
  let completed: NotificationProviderResult | null = null;
  const [result] = await dispatchNotificationPlans([plan], {
    async claim() {
      return { claimed: true };
    },
    async send() {
      throw new Error("Resend unavailable");
    },
    async complete(_candidate, provider) {
      completed = provider;
    }
  });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "Resend unavailable");
  assert.deepEqual(completed, {
    status: "failed",
    providerId: null,
    reason: "Resend unavailable"
  });
});
