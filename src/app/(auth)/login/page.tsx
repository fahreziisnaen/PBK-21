import { cookies } from 'next/headers';
import { AuthShell } from '@/components/shell/AuthShell';
import { prisma } from '@/lib/prisma';
import { CHALLENGE_COOKIE, evaluateChallenge } from '@/lib/auth-challenge';
import { chooseSecondFactor } from '@/lib/actions/choose-second-factor';
import { codeHint, type LoginStart } from '@/lib/auth-flow';
import { LoginForm } from './login-form';

/**
 * Tahap kode yang masih berjalan, dibaca dari cookie challenge. Tanpa ini,
 * memuat ulang halaman di tengah verifikasi akan kehilangan modalnya
 * sementara challenge-nya masih hidup di server — tamu terjebak pada form
 * sandi yang, kalau dikirim ulang, memakan jatah penerbitan challenge.
 */
async function resumeChallenge(): Promise<Extract<LoginStart, { ok: true }> | undefined> {
  const store = await cookies();
  const id = store.get(CHALLENGE_COOKIE)?.value;
  if (!id) return undefined;

  const challenge = await prisma.authChallenge.findUnique({ where: { id }, include: { user: true } });
  if (!challenge || challenge.purpose !== 'LOGIN') return undefined;
  if (evaluateChallenge(challenge, new Date()) !== 'usable') return undefined;

  const bootstrap = chooseSecondFactor(challenge.user) === 'BOOTSTRAP';
  return {
    ok: true,
    challengeId: challenge.id,
    bootstrap,
    hint: bootstrap ? null : codeHint(challenge.method === 'WA_OTP' ? 'WA_OTP' : 'TOTP', challenge.user.phone),
  };
}

/**
 * `?reset=1` means the visitor's session was deliberately ended — they reset
 * or changed their password. Without this they would simply find themselves
 * back at the login page with no idea why.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; ended?: string }>;
}) {
  const params = await searchParams;
  const wasReset = params.reset === '1';
  const wasEnded = params.ended === '1';
  // Sesi yang baru saja diakhiri tidak boleh langsung dilanjutkan ke tahap kode.
  const resume = wasReset || wasEnded ? undefined : await resumeChallenge();
  return (
    <AuthShell>
      <div>
        {wasReset ? (
            <p role="status" className="mb-4 rounded-lg bg-success-50 px-3 py-2 text-[12.5px] text-success-700">
              Sandi Anda berhasil diperbarui. Silakan masuk kembali dengan sandi baru.
            </p>
        ) : null}
        {wasEnded ? (
            <p role="status" className="mb-4 rounded-lg bg-gray-100 px-3 py-2 text-[12.5px] text-gray-600">
              Sesi Anda telah berakhir. Silakan masuk kembali.
            </p>
        ) : null}
        <LoginForm resume={resume} />
      </div>
    </AuthShell>
  );
}
