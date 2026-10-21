import argon2 from 'argon2';

// OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1).
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

let dummyHash: Promise<string> | null = null;

/**
 * Verifies a password. When no stored hash exists (unknown username) a dummy hash is verified
 * anyway so response timing does not reveal whether the account exists.
 */
export async function verifyPassword(hash: string | null | undefined, plain: string): Promise<boolean> {
  if (!hash) {
    dummyHash ??= argon2.hash('libra-dummy-password-for-timing', OPTIONS);
    await argon2.verify(await dummyHash, plain).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, OPTIONS);
}

/** Minimum policy for administrator-chosen passwords. Generated passwords always satisfy it. */
export function passwordPolicyError(pw: string): string | null {
  if (pw.length < 12) return 'Password must be at least 12 characters';
  if (pw.length > 128) return 'Password must be at most 128 characters';
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return 'Password must contain at least three of: lowercase, uppercase, digits, symbols';
  return null;
}
