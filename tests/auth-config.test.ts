import assert from "node:assert/strict";
import test from "node:test";
import { authOptions } from "../src/lib/auth";

test("Google first login links to an existing approved user", () => {
  const googleProvider = authOptions.providers.find((provider) => provider.id === "google");

  assert.ok(googleProvider);
  assert.ok("options" in googleProvider);
  assert.equal(googleProvider.options?.allowDangerousEmailAccountLinking, true);
});
