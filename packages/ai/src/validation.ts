/** Public parser errors refer to schema paths only, never supplied content. Extra keys are rejected. */
export const MAX_OUTPUT_BYTES = 65_536;

export function outputObject(raw: unknown, keys: readonly string[], label: string) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${label} is not an object`);
  }
  const object = raw as Record<string, unknown>;
  if (Object.keys(object).some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unsupported fields`);
  }
  return object;
}

export function outputString(raw: unknown, maxLength: number, label: string): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > maxLength) {
    throw new Error(`${label} must be nonempty and at most ${maxLength} characters`);
  }
  return raw.trim();
}

export function outputArray(raw: unknown, min: number, max: number, label: string): unknown[] {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max) {
    throw new Error(`${label} must contain ${min}-${max} items`);
  }
  return raw;
}

export function boundOutput(raw: unknown): void {
  let json: string | undefined;
  try {
    json = JSON.stringify(raw);
  } catch {
    throw new Error('Output is not serializable JSON');
  }
  if (!json || Buffer.byteLength(json, 'utf8') > MAX_OUTPUT_BYTES) {
    throw new Error('Output exceeds the byte limit');
  }
}
