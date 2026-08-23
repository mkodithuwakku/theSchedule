import assert from "node:assert/strict";
import test from "node:test";
import { canUseMobileEmployeePreview } from "@/lib/mobile-preview";

test("mobile employee preview is available during local development", () => {
  assert.equal(canUseMobileEmployeePreview({ NODE_ENV: "development" }), true);
});

test("mobile employee preview is available only on its exact Vercel preview branch", () => {
  assert.equal(
    canUseMobileEmployeePreview({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "codex/mobile-employee-ui",
    }),
    true,
  );

  assert.equal(
    canUseMobileEmployeePreview({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "main",
    }),
    false,
  );
});

test("mobile employee preview remains blocked on production", () => {
  assert.equal(
    canUseMobileEmployeePreview({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "codex/mobile-employee-ui",
    }),
    false,
  );
});
