'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/lib/auth';

export async function submitOtp(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  try {
    await signIn('otp', {
      challengeId: formData.get('challengeId'),
      code: formData.get('code'),
      redirectTo: '/dashboard',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return error.type === 'CredentialsSignin'
        ? 'Kode salah, sudah kedaluwarsa, atau sudah dipakai.'
        : 'Terjadi kesalahan saat masuk. Coba lagi.';
    }
    throw error; // redirect Next.js dilempar sebagai error — jangan ditelan
  }
}
