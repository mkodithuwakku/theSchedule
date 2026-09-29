import assert from "node:assert/strict";
import test from "node:test";
import type { CoverageRequest } from "@/lib/demo-data";
import { pendingCoverageForShift } from "@/lib/coverage-policy";
import { createDefaultTestState } from "@/lib/test-state";
import { authorizeEmployeeStateUpdate } from "@/lib/workspace-state";
import { assignWorkspaceShifts, openDueScheduleCycle } from "@/lib/schedule-progression";

test("a new owner can reopen coverage after approval, including a retained published period", () => {
  for (const archived of [false, true]) {
    let state = createDefaultTestState();
    state.period.status = "published";
    const [originalOwner, newOwner, thirdOwner] = state.people;
    const shiftId = state.shifts[0].id;
    state = assignWorkspaceShifts(state, { [shiftId]: newOwner.id });
    const approved: CoverageRequest = { id: "approved", shiftId, requestedById: originalOwner.id, claimedById: newOwner.id, status: "approved", reason: "First coverage" };
    state.coverage = [approved];
    if (archived) state = openDueScheduleCycle(state, new Date("2026-09-28T18:00:00Z"));
    const original = structuredClone(state);
    assert.equal(pendingCoverageForShift(state.coverage, shiftId), undefined);
    const request: CoverageRequest = { id: "reopened", shiftId, requestedById: newOwner.id, status: "open", reason: "Now sick" };
    const proposed = { ...state, coverage: [request, approved, { ...request, id: "duplicate" }] };
    const saved = authorizeEmployeeStateUpdate(state, proposed, newOwner.id);
    assert.deepEqual(saved.coverage.find((item) => item.id === "approved"), approved);
    assert.equal(pendingCoverageForShift(saved.coverage, shiftId)?.id, request.id);
    assert.equal(saved.coverage.length, 2, "only one active request per shift");
    assert.deepEqual(saved.shifts, state.shifts);
    assert.deepEqual(saved.scheduleHistory, state.scheduleHistory);
    const offered = authorizeEmployeeStateUpdate(saved, { ...saved, coverage: [{ ...request, status: "offered", claimedById: thirdOwner.id }] }, thirdOwner.id);
    assert.equal(pendingCoverageForShift(offered.coverage, shiftId)?.claimedById, thirdOwner.id);
    const forged = authorizeEmployeeStateUpdate(state, { ...state, coverage: [{ ...request, requestedById: originalOwner.id }] }, originalOwner.id);
    assert.deepEqual(forged.coverage, state.coverage, "previous owner cannot repost someone else's shift");
    assert.deepEqual(state, original);
  }
});

test("only open or offered coverage blocks a new request regardless of history order", () => {
  const base: CoverageRequest = { id: "history", shiftId: "shift", requestedById: "owner", status: "approved", reason: "" };
  for (const status of ["approved", "rejected", "cancelled"] as const) {
    assert.equal(pendingCoverageForShift([{ ...base, status }], "shift"), undefined);
  }
  for (const status of ["open", "offered"] as const) {
    const pending = { ...base, id: "pending", status };
    assert.equal(pendingCoverageForShift([base, pending], "shift"), pending);
    assert.equal(pendingCoverageForShift([pending, base], "shift"), pending);
  }
});
