/** URL policy for untrusted assistant Markdown. No browser/Node dependencies. */
export function safeMarkdownUrl(value: string): string | null {
  if (!value || value.length > 2048 || value !== value.trim()) return null;
  if (/[\u0000-\u0020]/.test(value)) return null;
  // Inspect repeated encodings without using the decoded value as a destination.
  // Encoded delimiters/control characters must not change how a URL is interpreted.
  let inspected = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029\ufeff\\]/.test(inspected)) return null;
    if (inspected.startsWith('//')) return null;
    if (/%(?:2f|5c)/i.test(inspected)) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(inspected);
    } catch {
      return null;
    }
    if (decoded === inspected) break;
    if (depth === 3) return null;
    inspected = decoded;
  }

  if (value.startsWith('/') || value.startsWith('#') || value.startsWith('?')) {
    try {
      const url = new URL(value, 'https://markdown.invalid');
      return url.origin === 'https://markdown.invalid' ? value : null;
    } catch {
      return null;
    }
  }
  // Keep mail links simple: no header/query injection, attachments or multiple recipients.
  if (/^mailto:[^\s@?:]+@[^\s@?:]+\.[^\s@?:]+$/i.test(value)) return value;
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
