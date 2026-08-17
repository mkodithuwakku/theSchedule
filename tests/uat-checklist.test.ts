import assert from "node:assert/strict";
import test from "node:test";
import {
  UAT_CHECKLIST_GROUPS,
  UAT_CHECKLIST_ITEMS,
  normalizeUatChecklistProgress
} from "@/lib/uat-checklist";
import { GUIDED_UAT_ACCOUNTS, GUIDED_UAT_PHASES, GUIDED_UAT_STEPS } from "@/lib/guided-uat";
import { createCleanRunTestState, createDefaultTestState, normalizeTestState } from "@/lib/test-state";
import { CLEAN_RUN_CONFIRMATION, isCleanRunConfirmation } from "@/lib/uat-reset-shared";

test("production UAT checklist is extensive and has unique stable IDs", () => {
  const ids = UAT_CHECKLIST_ITEMS.map((item) => item.id);

  assert(UAT_CHECKLIST_GROUPS.length >= 10);
  assert(UAT_CHECKLIST_ITEMS.length >= 80);
  assert.equal(new Set(ids).size, ids.length);
  assert(UAT_CHECKLIST_ITEMS.every((item) => item.steps.length > 0 && item.expected.trim().length > 0));
  assert(UAT_CHECKLIST_ITEMS.some((item) => item.critical));
  assert(UAT_CHECKLIST_ITEMS.some((item) => item.cleanRunRecommended));
});

test("checklist progress accepts only known test IDs and statuses", () => {
  const firstId = UAT_CHECKLIST_ITEMS[0].id;
  const result = normalizeUatChecklistProgress({
    [firstId]: "passed",
    unknown: "failed",
    [UAT_CHECKLIST_ITEMS[1].id]: "invalid",
    [UAT_CHECKLIST_ITEMS[2].id]: "not_run"
  });

  assert.deepEqual(result, { [firstId]: "passed" });
});

test("guided UAT is an ordered full schedule journey backed by advanced results", () => {
  const advancedIds = new Set(UAT_CHECKLIST_ITEMS.map((item) => item.id));
  const guidedIds = GUIDED_UAT_STEPS.map((step) => step.id);

  assert.equal(GUIDED_UAT_PHASES.length, 10);
  assert(GUIDED_UAT_STEPS.length >= 35);
  assert.equal(new Set(guidedIds).size, guidedIds.length);
  assert(GUIDED_UAT_STEPS.every((step) => advancedIds.has(step.id)));
  assert(GUIDED_UAT_STEPS.every((step) => step.instructions.length >= 3 && step.expected.trim().length > 0));
  assert.deepEqual(GUIDED_UAT_PHASES.map((phase) => phase.id), [
    "guided-sign-in",
    "guided-manager-setup",
    "guided-availability",
    "guided-build",
    "guided-publish",
    "guided-employee-review",
    "guided-coverage",
    "guided-swaps",
    "guided-finish",
    "guided-day-progression"
  ]);
  assert(GUIDED_UAT_ACCOUNTS.some((account) => account.role === "Manager"));
  assert.equal(GUIDED_UAT_ACCOUNTS.filter((account) => account.role.startsWith("Employee")).length, 3);
});

test("clean production reset requires the exact typed phrase", () => {
  assert.equal(isCleanRunConfirmation(CLEAN_RUN_CONFIRMATION), true);
  assert.equal(isCleanRunConfirmation(CLEAN_RUN_CONFIRMATION.toLowerCase()), false);
  assert.equal(isCleanRunConfirmation(`${CLEAN_RUN_CONFIRMATION} `), false);
  assert.equal(isCleanRunConfirmation(undefined), false);
});

test("a clean run keeps its unique identifier through state normalization", () => {
  const cleanRun = createDefaultTestState("uat_new_run");

  assert.equal(cleanRun.uatRunId, "uat_new_run");
  assert.equal(normalizeTestState(cleanRun).uatRunId, "uat_new_run");
});

test("a clean production run opens a future Edmonton schedule window", () => {
  const cleanRun = createCleanRunTestState("uat_new_run", new Date("2026-08-17T18:00:00.000Z"));

  assert.equal(cleanRun.period.availabilityOpenAt, "2026-08-17");
  assert.equal(cleanRun.period.availabilityDeadlineAt, "2026-08-22");
  assert.equal(cleanRun.period.releaseDate, "2026-08-24");
  assert.equal(cleanRun.period.startDate, "2026-08-25");
  assert.equal(cleanRun.period.endDate, "2026-09-10");
  assert(cleanRun.shifts.length > 0);
  assert(cleanRun.shifts.every((shift) => shift.schedulePeriodId === cleanRun.period.id));
});
