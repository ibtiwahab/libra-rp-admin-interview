import { authenticator } from 'otplib';
import QRCode from 'qrcode';

authenticator.options = { step: 30, window: 1, digits: 6 };

const ISSUER = 'LIBRA RP Recruitment';

export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

export async function totpProvisioning(username: string, secret: string) {
  const otpauthUrl = authenticator.keyuri(username, ISSUER, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220, color: { dark: '#08090D', light: '#F4EBD0' } });
  return { otpauthUrl, qrDataUrl };
}

export function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}

export function currentTotp(secret: string): string {
  return authenticator.generate(secret);
}
