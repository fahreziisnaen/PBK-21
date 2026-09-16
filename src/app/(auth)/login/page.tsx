import { BrandLockup } from '@/components/shell/BrandMark';
import { LoginForm } from './login-form';

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
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex flex-col justify-between gap-10 px-8 py-10 lg:px-14 lg:py-13">
        <BrandLockup tone="light" size={48} priority />

        <div className="w-full max-w-[376px]">
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
          <LoginForm />
        </div>

        <div className="text-[11.5px] text-gray-500">SMAN 21 Surabaya · Tahun anggaran 2026</div>
      </div>

      <div className="hidden bg-sidebar lg:block" aria-hidden />
    </div>
  );
}
