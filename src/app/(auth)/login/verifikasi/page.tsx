import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { CHALLENGE_COOKIE, evaluateChallenge } from '@/lib/auth-challenge';
import { chooseSecondFactor } from '@/lib/actions/choose-second-factor';
import { VerifyForm } from './verify-form';

function maskPhone(phone: string | null): string {
  if (!phone || phone.length < 4) return '••••';
  return `••••${phone.slice(-4)}`;
}

export default async function VerifikasiPage() {
  const store = await cookies();
  const challengeId = store.get(CHALLENGE_COOKIE)?.value;
  if (!challengeId) redirect('/login');

  const challenge = await prisma.authChallenge.findUnique({
    where: { id: challengeId },
    include: { user: true },
  });
  if (!challenge || challenge.purpose !== 'LOGIN') redirect('/login');

  const state = evaluateChallenge(challenge, new Date());

  // A dead challenge (already consumed, expired, or exhausted) has nothing
  // left to verify or forward. Sending the guest back to /login to restart
  // means the bootstrap branch below never mounts its auto-submit against a
  // challenge that can only fail — which is what would otherwise risk a
  // redirect loop back to this very page.
  if (state !== 'usable') redirect('/login');

  const isBootstrap = chooseSecondFactor(challenge.user) === 'BOOTSTRAP';

  const hint = isBootstrap
    ? null
    : challenge.method === 'TOTP'
      ? 'Masukkan kode dari Google Authenticator'
      : `Kode telah dikirim ke WhatsApp ${maskPhone(challenge.user.phone)}`;

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex flex-col justify-between gap-10 px-8 py-10 lg:px-14 lg:py-13">
        <div className="flex items-center gap-3">
          <div className="grid h-[38px] w-[38px] place-items-center rounded-[9px] bg-brand-600 text-sm font-extrabold text-white">
            PBK
          </div>
          <div>
            <div className="text-sm font-bold tracking-[-0.2px]">Pencatatan Buku Kas</div>
            <div className="text-[11.5px] text-gray-500">Sistem Administrasi Keuangan Sekolah</div>
          </div>
        </div>

        <VerifyForm challengeId={challenge.id} hint={hint} autoSubmit={isBootstrap} />

        <div className="text-[11.5px] text-gray-500">SMAN 21 Surabaya · Tahun anggaran 2026</div>
      </div>

      <div className="hidden bg-sidebar lg:block" aria-hidden />
    </div>
  );
}
