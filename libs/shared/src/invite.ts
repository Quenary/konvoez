/**
 * Builds the sign-up link for an invite. Returns `null` when `baseUrl` is not a valid URL.
 */
export function buildInviteUrl(
  baseUrl: string,
  code: string,
  email?: string | null,
): string | null {
  try {
    const url = new URL('/auth/register', baseUrl);
    url.searchParams.set('code', code);
    if (email) {
      url.searchParams.set('email', email);
    }
    return url.toString();
  } catch {
    return null;
  }
}
