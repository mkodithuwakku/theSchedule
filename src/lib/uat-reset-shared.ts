export const CLEAN_RUN_CONFIRMATION = "RESET CLEAN RUN";

export function isCleanRunConfirmation(value: unknown) {
  return value === CLEAN_RUN_CONFIRMATION;
}
