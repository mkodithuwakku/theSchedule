import type { CoverageRequest } from "@/lib/demo-data";

export function isPendingCoverage(request: CoverageRequest) {
  return request.status === "open" || request.status === "offered";
}

/** Completed requests are history; only an active request blocks another one. */
export function pendingCoverageForShift(requests: CoverageRequest[], shiftId: string) {
  return requests.find((request) => request.shiftId === shiftId && isPendingCoverage(request));
}
