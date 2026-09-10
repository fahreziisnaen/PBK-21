import { Secret, TOTP } from 'otpauth';

const ISSUER = 'PBK';
const DIGITS = 6;
const PERIOD = 30;

function totpFor(secret: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1', // what Google Authenticator expects
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/**
 * The exact shape `generateTotpSecret` produces: 20 bytes as 32 unpadded
 * base32 characters. Enrolment takes the secret back from a hidden form
 * field, so without this a user could post a one-character secret with a
 * matching code and enrol it as their real second factor — the weakest
 * possible 2FA on the account we force 2FA onto hardest.
 */
export function isValidTotpSecret(secret: string): boolean {
  return /^[A-Z2-7]{32}$/.test(secret);
}

export function buildOtpauthUri(username: string, secret: string): string {
  // Reuse the same construction as verifyTotp — `label` is a plain mutable
  // property on TOTP, so there's no need for a second, separately-written
  // constructor call. If enrolment and verification ever built TOTP with
  // different parameters, everyone who enrolled in between would be
  // permanently locked out with no symptom pointing at the cause.
  const totp = totpFor(secret);
  totp.label = username;
  return totp.toString();
}

/**
 * `window: 1` accepts the previous and next step, covering a phone clock
 * that drifts by up to 30 seconds either way. Wider windows trade real
 * security for convenience and are not worth it here.
 */
export function verifyTotp(secret: string, code: string, at?: Date): boolean {
  const cleaned = code.replace(/\D/g, '');
  if (cleaned.length !== DIGITS) return false;
  const delta = totpFor(secret).validate({ token: cleaned, window: 1, timestamp: at?.getTime() });
  return delta !== null;
}
