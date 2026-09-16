import { AuthShell } from '@/components/shell/AuthShell';
import { CompleteResetForm } from './complete-form';

/**
 * Renders for every visitor, with or without a valid challenge cookie. The
 * page must not vary by whether the username existed — a redirect back to
 * /lupa-sandi, or a hint naming TOTP versus WhatsApp, would each let anyone
 * enumerate usernames and their second factors from a public form. A visitor
 * without a real challenge simply has no code that will ever verify.
 */
export default function VerifyResetPage() {
  return (
    <AuthShell>
      <CompleteResetForm hint="Masukkan kode dari aplikasi autentikator Anda, atau kode yang dikirim ke WhatsApp Anda, lalu pilih sandi baru." />
    </AuthShell>
  );
}
