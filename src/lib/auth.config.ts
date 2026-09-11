import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  providers: [], // diisi di auth.ts — provider butuh Prisma
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
        // Frozen at sign-in — see isSessionStale.
        token.pwc = user.passwordChangedAt ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as typeof session.user.role;
        // Carried through so the (app) layout can tell whether this token
        // predates the owner's last password change. JWT sessions cannot be
        // revoked server-side; comparing this frozen stamp against the live
        // column is what makes a password reset actually end sessions
        // elsewhere.
        session.user.passwordStamp = token.pwc as number | undefined;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
