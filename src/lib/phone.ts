/**
 * Indonesian mobile numbers are stored canonically as 62 + national
 * significant number, where the NSN starts with 8 and is 9-12 digits long.
 * Landlines (021, 031, ...) cannot receive WhatsApp and are rejected.
 */
const CANONICAL = /^628\d{8,11}$/;

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  // Reject anything containing characters that are neither digits nor the
  // separators people commonly type. A letter means a typo, not a number.
  if (/[^\d\s()+\-.]/.test(trimmed)) return null;

  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return null;

  let candidate: string;
  if (digits.startsWith('62')) candidate = digits;
  else if (digits.startsWith('0')) candidate = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) candidate = `62${digits}`;
  else return null;

  return CANONICAL.test(candidate) ? candidate : null;
}

export function formatPhoneLocal(normalized: string | null): string {
  if (!normalized) return '';
  const nsn = normalized.slice(2); // drop the 62
  const local = `0${nsn}`;
  // 0812-3344-5566 — group as 4-4-rest, which is how Indonesians write it.
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
}
