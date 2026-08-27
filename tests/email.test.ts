import assert from "node:assert/strict";
import test from "node:test";
import {
  actionNotificationEmail,
  availabilityReminderEmail,
  employeeInviteEmail,
  ownerAlertEmail,
  schedulePublishedEmail
} from "../src/lib/email-templates";

const appUrl = "https://mafm-schedule.vercel.app";

function assertActionEmail(html: string, label: string, url: string) {
  assert.match(html, new RegExp(`>\\s*${label}\\s*<`));
  assert.match(html, /If the button does not work, copy and paste this link into your browser/);
  assert.equal(html.split(url).length - 1, 3);
}

test("employee invitation includes a prominent action and fallback link without manager wording", () => {
  const inviteUrl = `${appUrl}/api/invites/accept?token=test-token`;
  const message = employeeInviteEmail(inviteUrl);

  assert.equal(message.subject, "You've been invited to The Schedule");
  assert.match(message.html, /You&#039;ve been invited to The Schedule/);
  assertActionEmail(message.html, "Accept invitation", inviteUrl);
  assert.doesNotMatch(message.html, /manager/i);
});

test("availability reminder has a clear action and fallback link", () => {
  const message = availabilityReminderEmail("August 30-September 12", "2026-08-28", appUrl);

  assert.equal(message.subject, "Availability due for August 30-September 12");
  assert.match(message.html, /Please submit unavailable days or time ranges by 2026-08-28/);
  assertActionEmail(message.html, "Submit availability", appUrl);
});

test("published schedule includes assigned shifts plus a clear action and fallback link", () => {
  const message = schedulePublishedEmail(
    "August 30-September 12",
    appUrl,
    "<ul><li><strong>Sunday, August 30, 2026</strong>: 10:00 a.m.-6:00 p.m.</li></ul>"
  );

  assert.equal(message.subject, "New schedule published: August 30-September 12");
  assert.match(message.html, /Your shifts/);
  assert.match(message.html, /Sunday, August 30, 2026/);
  assertActionEmail(message.html, "View the full schedule", appUrl);
});

test("action notifications escape dynamic copy and always include a usable link", () => {
  const message = actionNotificationEmail(
    "Shift <updated>",
    "Alex & Sam's shift changed.",
    "Open & review",
    `${appUrl}/?view=team&day=Sunday`
  );

  assert.match(message.html, /Shift &lt;updated&gt;/);
  assert.match(message.html, /Alex &amp; Sam&#039;s shift changed/);
  assert.match(message.html, /Open &amp; review/);
  assertActionEmail(message.html, "Open &amp; review", `${appUrl}/?view=team&amp;day=Sunday`);
  assert.doesNotMatch(message.html, /Shift <updated>/);
});

test("owner alerts escape diagnostic values and link back to the app", () => {
  const message = ownerAlertEmail(
    "Notification <failed>",
    [{ label: "Recipient", value: "Alex <alex@example.com> & team" }],
    appUrl
  );

  assert.equal(message.subject, "[The Schedule] Notification <failed>");
  assert.match(message.html, /Notification &lt;failed&gt;/);
  assert.match(message.html, /Alex &lt;alex@example.com&gt; &amp; team/);
  assertActionEmail(message.html, "Open The Schedule", appUrl);
});
