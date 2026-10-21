import crypto from 'node:crypto';
import { env } from '../config/env';

/** URL-safe random token. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** HMAC-SHA256 keyed with SESSION_SECRET. Used so that DB contents alone cannot forge session cookies. */
export function hmac(value: string, purpose = 'session'): string {
  return crypto.createHmac('sha256', env.SESSION_SECRET).update(`${purpose}:${value}`).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Unambiguous alphabet (no 0/O, 1/l/I).
const PW_LOWER = 'abcdefghijkmnpqrstuvwxyz';
const PW_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PW_DIGIT = '23456789';
const PW_ALL = PW_LOWER + PW_UPPER + PW_DIGIT;

function pick(set: string): string {
  return set[crypto.randomInt(set.length)]!;
}

/**
 * Generates a high-entropy, human-transcribable password such as `Kx7m-Qp3r-Zt9w-Hn4v`
 * (16 random characters from a 56-symbol alphabet ≈ 93 bits of entropy).
 */
export function generatePassword(groups = 4, groupLength = 4): string {
  const chars: string[] = [];
  const total = groups * groupLength;
  // guarantee at least one of each class
  chars.push(pick(PW_LOWER), pick(PW_UPPER), pick(PW_DIGIT));
  while (chars.length < total) chars.push(pick(PW_ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  const out: string[] = [];
  for (let g = 0; g < groups; g++) out.push(chars.slice(g * groupLength, (g + 1) * groupLength).join(''));
  return out.join('-');
}

/** Short uppercase reference code for watermarks, e.g. `A7F2K9`. */
export function shortCode(length = 6): string {
  const set = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < length; i++) s += pick(set);
  return s;
}

const MFA_KEY = crypto.createHash('sha256').update(env.MFA_ENCRYPTION_KEY).digest();

/** AES-256-GCM encryption for secrets at rest (TOTP seeds). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MFA_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(payload: string): string {
  const [ivB, tagB, encB] = payload.split('.');
  if (!ivB || !tagB || !encB) throw new Error('Malformed secret payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', MFA_KEY, Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encB, 'base64url')), decipher.final()]).toString('utf8');
}
