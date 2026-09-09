'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/lib/auth';

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/dashboard',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return error.type === 'CredentialsSignin'
        ? 'Email atau kata sandi salah.'
        : 'Terjadi kesalahan saat masuk. Coba lagi.';
    }
    throw error; // redirect Next.js dilempar sebagai error — jangan ditelan
  }
}
