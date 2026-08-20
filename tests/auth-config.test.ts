import assert from "node:assert/strict";
import test from "node:test";
import { authOptions } from "../src/lib/auth";

test("Google first login links to an existing approved user", () => {
  const googleProvider = authOptions.providers.find(
    (provider) => provider.id === "google",
  );

  assert.ok(googleProvider);
  assert.ok("options" in googleProvider);
  assert.equal(googleProvider.options?.allowDangerousEmailAccountLinking, true);
});

test("approved users receive a ten-year rolling browser session", () => {
  assert.equal(authOptions.session?.strategy, "database");
  assert.equal(authOptions.session?.maxAge, 10 * 365 * 24 * 60 * 60);
});
