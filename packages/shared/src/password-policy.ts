export const BCRYPT_PASSWORD_MAX_BYTES = 72;
// Prior signup accepted 128 UTF-16 units (at most 384 UTF-8 bytes). Keep legacy login.
export const LEGACY_PASSWORD_MAX_BYTES = 512;
// Algorithm-policy metadata in the existing column; no schema/data migration.
export const STRICT_BCRYPT_HASH_PREFIX = 'bcrypt72-v1:';

export function strictBcryptPasswordHash(hash: string): string {
  return `${STRICT_BCRYPT_HASH_PREFIX}${hash}`;
}

export function storedPasswordPolicy(stored: string): { hash: string; strictBytes: boolean } {
  const strictBytes = stored.startsWith(STRICT_BCRYPT_HASH_PREFIX);
  return {
    hash: strictBytes ? stored.slice(STRICT_BCRYPT_HASH_PREFIX.length) : stored,
    strictBytes,
  };
}

export function passwordByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function isWellFormedPassword(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}
