import assert from "node:assert/strict";
import test from "node:test";
import { employeeInviteEmail } from "../src/lib/email";

test("employee invitation includes a prominent action and fallback link without manager wording", () => {
  const inviteUrl = "https://mafm-schedule.vercel.app/api/invites/accept?token=test-token";
  const message = employeeInviteEmail(inviteUrl);

  assert.equal(message.subject, "You've been invited to The Schedule");
  assert.match(message.html, /You've been invited to The Schedule/);
  assert.match(message.html, />\s*Accept invitation\s*</);
  assert.match(message.html, /If the button does not work, copy and paste this link into your browser/);
  assert.equal(message.html.split(inviteUrl).length - 1, 3);
  assert.doesNotMatch(message.html, /manager/i);
});
