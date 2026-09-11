// Break-glass recovery tool, run over SSH by an administrator who already
// has server access: `npm run auth:recover -- --username=<username>`.
//
// This is the ONLY recovery path for an account that has neither TOTP nor a
// phone number — see canSelfReset in src/lib/auth-gates.ts. Such an account
// proves nothing by typing its own username, so the forgot-password page
// deliberately refuses it; letting it self-reset would let anyone reset it
// the same way. An operator with a shell on the server is a different trust
// level entirely, which is what this script relies on.
import 'dotenv/config';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { recordAuthEvent } from '@/lib/auth-event';
import { AUTH_EVENTS } from '@/lib/auth-event-names';

const CHARSETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digit: '0123456789',
  // Excludes `$ ` ' \` — DEPLOYMENT.md's dollar-quoting note (Langkah 5) is
  // the reminder of what happens when a credential meets a shell that
  // partially interprets it. This password is never meant to be typed into
  // a shell at all (it goes into the web login form), but there is no
  // reason to hand an operator a reason to worry about it.
  symbol: '!@#%^&*()-_=+[]{}:,.?',
} as const;

const ALL_CHARS = Object.values(CHARSETS).join('');
const DEFAULT_LENGTH = 20;
const MIN_LENGTH = 16;

/**
 * Temporary password for a recovered account. Minimum 16 characters,
 * guaranteed one character from each class by construction (not left to
 * chance), drawn from node:crypto's CSPRNG — never Math.random(), which
 * must not be anywhere near anything that becomes a credential.
 */
export function generateTemporaryPassword(length: number = DEFAULT_LENGTH): string {
  if (length < MIN_LENGTH) {
    throw new Error(`Panjang sandi sementara minimal ${MIN_LENGTH} karakter.`);
  }

  const chars: string[] = Object.values(CHARSETS).map((set) => set[randomInt(set.length)]);
  while (chars.length < length) {
    chars.push(ALL_CHARS[randomInt(ALL_CHARS.length)]);
  }

  // Fisher–Yates, so the four guaranteed-class characters are not always
  // sitting in the first four positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

class RecoveryError extends Error {}

function parseUsername(argv: string[]): string {
  const arg = argv.find((a) => a.startsWith('--username='));
  const username = arg?.slice('--username='.length).trim();
  if (!username) {
    throw new RecoveryError(
      'Pemakaian: npm run auth:recover -- --username=<username>',
    );
  }
  return username;
}

async function main() {
  const username = parseUsername(process.argv.slice(2));

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw new RecoveryError(`Pengguna "${username}" tidak ditemukan.`);
    }

    const temporaryPassword = generateTemporaryPassword();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        // 2FA dinonaktifkan total — pemilik akun mendaftar ulang dari nol
        // setelah masuk, sama seperti akun bootstrap yang baru dibuat.
        totpSecret: null,
        totpEnabledAt: null,
        passwordHash: await bcrypt.hash(temporaryPassword, 10), // cost 10, matching prisma/seed.ts
        mustChangePassword: true,
        // Mengakhiri SETIAP sesi akun ini, termasuk yang mungkin sedang
        // dipakai penyerang — lihat isSessionStale di src/lib/auth-gates.ts.
        // Skrip ini dijalankan justru karena akun diduga terkunci atau
        // diambil alih, jadi mengakhiri sesi lama adalah perilaku yang
        // benar di sini, sama seperti change-password dan forgot-password.
        passwordChangedAt: new Date(),
      },
    });

    await recordAuthEvent({
      event: AUTH_EVENTS.RECOVERY_SSH_USED,
      userId: user.id,
      username: user.username,
      meta: { totpCleared: true },
    });

    console.log(`Akun "${username}" dipulihkan. 2FA dinonaktifkan, sandi sementara diterbitkan:\n`);
    console.log(`  ${temporaryPassword}\n`);
    console.log(
      [
        'PENTING:',
        '- Sandi ini hanya dicetak sekali, di sini. Sampaikan ke pemilik akun lewat',
        '  jalur aman (bukan chat atau email biasa), lalu hapus dari layar Anda.',
        '- Sandi ini kemungkinan besar tersimpan di riwayat shell dan log sesi SSH',
        '  server ini. Bersihkan riwayat/scrollback setelah dicatat bila sesi ini',
        '  di-log ke tempat lain (mis. bastion host, session recorder).',
        '- Pemilik akun akan dipaksa mengganti sandi ini saat pertama kali masuk,',
        '  lalu mendaftar ulang TOTP karena 2FA lama sudah dihapus di atas.',
        '- Sesi lama akun ini di perangkat mana pun langsung berakhir — ini',
        '  sengaja, karena pemulihan lewat SSH umumnya dipakai justru saat akun',
        '  diduga sudah diambil alih.',
      ].join('\n'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when this file is the process entry point (`npx tsx
// scripts/auth-recover.ts`, via `npm run auth:recover`), not when a test
// imports generateTemporaryPassword for inspection — mirrors prisma/seed.ts.
const isEntryPoint = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntryPoint) {
  main().catch((e) => {
    if (e instanceof RecoveryError) {
      console.error(`Gagal: ${e.message}`);
    } else {
      console.error(e);
    }
    process.exit(1);
  });
}
