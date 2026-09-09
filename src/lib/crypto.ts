import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard
const KEY_BYTES = 32;

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY belum diisi. Set di .env (pengembangan lokal) atau di ' +
        'environment container (produksi) — lihat .env.example.',
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== KEY_BYTES) {
    throw new Error(`ENCRYPTION_KEY harus 32 byte base64; diterima ${buf.length} byte.`);
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Payload terenkripsi tidak berbentuk benar.');
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64url'));

  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  // GCM throws here when the ciphertext or tag has been altered.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
