import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAuthCallbackUrl } from "../src/lib/auth-callback";

const appBaseUrl = "https://mafm-schedule.vercel.app";

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
