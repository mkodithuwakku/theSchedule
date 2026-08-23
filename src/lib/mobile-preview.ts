const MOBILE_PREVIEW_BRANCH = "codex/mobile-employee-ui";

// Temporary mobile-branch scaffold. Remove this module and its entry point
// before merging the mobile work into main.

type MobilePreviewEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
};

export function canUseMobileEmployeePreview(
  environment: MobilePreviewEnvironment = process.env,
) {
  if (environment.NODE_ENV === "development") return true;

  return (
    environment.VERCEL_ENV === "preview" &&
    environment.VERCEL_GIT_COMMIT_REF === MOBILE_PREVIEW_BRANCH
  );
}
