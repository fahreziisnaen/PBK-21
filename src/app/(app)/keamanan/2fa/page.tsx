import { redirect } from 'next/navigation';
import { PageHead } from '@/components/shell/PageHead';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth-guard';
import { beginEnrollment } from '@/lib/actions/totp-enroll';
import { EnrollForm } from './enroll-form';

export default async function TotpEnrollPage() {
  // Checked here so an already-enrolled visitor is sent away quietly. Letting
  // beginEnrollment's refusal throw instead put them in the generic error
  // boundary, whose Retry button re-throws forever — and every user can reach
  // this page with the Back button the moment they finish enrolling.
  const sessionUser = await requireUser({ allowGated: true });
  const enrolled = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { totpEnabledAt: true },
  });
  if (enrolled?.totpEnabledAt) redirect('/dashboard');

  const { secret, qrDataUri } = await beginEnrollment();

  return (
    <>
      <PageHead pathname="/keamanan/2fa" />
      <div className="max-w-[560px] rounded-xl border border-gray-200 bg-white p-8">
        <h2 className="mb-1 text-[15px] font-bold text-gray-900">Aktifkan Verifikasi Dua Langkah</h2>
        <p className="mb-6 text-[13px] text-gray-500">
          Pindai kode QR berikut dengan aplikasi authenticator (mis. Google Authenticator), atau masukkan
          kode secara manual, lalu masukkan kode enam digit yang muncul untuk menyelesaikan pendaftaran.
        </p>
        <EnrollForm secret={secret} qrDataUri={qrDataUri} />
      </div>
    </>
  );
}
