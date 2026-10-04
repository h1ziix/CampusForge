/**
 * Cookie-authenticated Route Handlers do not inherit the Server Action Origin guard.
 * Use a configured public origin, never user-supplied Host/X-Forwarded-* headers.
 * Browser POSTs must provide Origin; non-browser clients must provide it explicitly.
 */
export function isTrustedMutationOrigin(
  headers: Pick<Headers, 'get'>,
  environment: Record<string, string | undefined> = process.env,
): boolean {
  const configured = environment.AUTH_URL || environment.NEXTAUTH_URL;
  const supplied = headers.get('origin');
  if (!configured || !supplied) return false;
  try {
    const trusted = new URL(configured);
    if (!['https:', 'http:'].includes(trusted.protocol) || trusted.username || trusted.password) {
      return false;
    }
    // Equality also rejects opaque/null origins, URL paths, multiple origins and whitespace.
    if (supplied !== trusted.origin) return false;
    const site = headers.get('sec-fetch-site');
    return site === null || site === 'same-origin';
  } catch {
    return false;
  }
}
