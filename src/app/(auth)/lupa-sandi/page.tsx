import { AuthShell } from '@/components/shell/AuthShell';
import { RequestResetForm } from './request-form';

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <RequestResetForm />
    </AuthShell>
  );
}
