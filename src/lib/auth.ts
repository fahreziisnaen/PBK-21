import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from '@/lib/auth.config';
import { authorizeOtp } from '@/lib/auth-otp';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: 'otp',
      credentials: { challengeId: {}, code: {} },
      authorize: (raw) => authorizeOtp(raw),
    }),
  ],
});
