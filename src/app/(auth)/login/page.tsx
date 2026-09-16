import { AuthShell } from '@/components/shell/AuthShell';
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
        <LoginForm />
      </div>
    </AuthShell>
  );
}
