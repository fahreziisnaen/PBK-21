import { AuthShell } from '@/components/shell/AuthShell';
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
    <AuthShell>

        <VerifyForm challengeId={challenge.id} hint={hint} autoSubmit={isBootstrap} />

    </AuthShell>
  );
}
