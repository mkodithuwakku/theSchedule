export function normalizeAuthCallbackUrl(
  value: string | string[] | undefined,
  appBaseUrl: string,
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return "/";

  try {
    const baseUrl = new URL(appBaseUrl);
    const callbackUrl = new URL(candidate, baseUrl);

    if (callbackUrl.origin !== baseUrl.origin) return "/";

    return `${callbackUrl.pathname}${callbackUrl.search}${callbackUrl.hash}`;
  } catch {
    return "/";
  }
}
