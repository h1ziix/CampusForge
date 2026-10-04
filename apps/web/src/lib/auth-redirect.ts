const FALLBACK_PATH = '/dashboard';
const RAW_AMBIGUITY = /[\u0000-\u0020\u007f-\u009f\u2028\u2029\ufeff\\]/;
const ENCODED_AMBIGUITY = /%(?:2f|5c|25|0[0-9a-f]|1[0-9a-f]|7f)/i;

/** Return a local route only; callers never navigate using the original value. */
export function safePostLoginPath(value: unknown, trustedOrigin?: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    return FALLBACK_PATH;
  }
  if (RAW_AMBIGUITY.test(value) || ENCODED_AMBIGUITY.test(value) || value.startsWith('//')) {
    return FALLBACK_PATH;
  }
  try {
    // Invalid percent sequences and encoded controls are rejected, not repaired.
    if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029\ufeff\\]/.test(decodeURIComponent(value)))
      return FALLBACK_PATH;
    const origin = new URL(trustedOrigin ?? 'https://campusforge.invalid').origin;
    const isLocal = value.startsWith('/');
    if (!isLocal && (!trustedOrigin || !/^https?:\/\//i.test(value))) return FALLBACK_PATH;
    const url = new URL(value, origin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== origin ||
      url.username ||
      url.password
    ) {
      return FALLBACK_PATH;
    }
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith('/') && !path.startsWith('//') ? path : FALLBACK_PATH;
  } catch {
    return FALLBACK_PATH;
  }
}
