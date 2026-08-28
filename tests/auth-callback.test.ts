import assert from "node:assert/strict";
import test from "node:test";
import { buildInvitationUrl } from "../src/lib/app-url";
import { normalizeAuthCallbackUrl } from "../src/lib/auth-callback";

const appBaseUrl = "https://mafm-schedule.vercel.app";

test("mobile invitations open the app before continuing through Google sign-in", () => {
  const invitationUrl = new URL(buildInvitationUrl(appBaseUrl, "abc 123"));

  assert.equal(invitationUrl.origin, appBaseUrl);
  assert.equal(invitationUrl.pathname, "/");
  assert.equal(invitationUrl.searchParams.get("invite"), "pending");
  assert.equal(
    invitationUrl.searchParams.get("callbackUrl"),
    "/api/invites/accept?token=abc%20123",
  );
});

test("preserves a relative invitation acceptance callback", () => {
  assert.equal(
    normalizeAuthCallbackUrl("/api/invites/accept?token=abc123", appBaseUrl),
    "/api/invites/accept?token=abc123",
  );
});

test("converts a same-origin absolute callback to a relative URL", () => {
  assert.equal(
    normalizeAuthCallbackUrl(
      "https://mafm-schedule.vercel.app/api/invites/accept?token=abc123",
      appBaseUrl,
    ),
    "/api/invites/accept?token=abc123",
  );
});

test("rejects an external authentication callback", () => {
  assert.equal(
    normalizeAuthCallbackUrl("https://example.com/steal-session", appBaseUrl),
    "/",
  );
  assert.equal(normalizeAuthCallbackUrl("//example.com", appBaseUrl), "/");
});

test("defaults missing and malformed callbacks to the app root", () => {
  assert.equal(normalizeAuthCallbackUrl(undefined, appBaseUrl), "/");
  assert.equal(normalizeAuthCallbackUrl("http://[", appBaseUrl), "/");
});
