import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authConfig } from '@/lib/auth.config';

const credentialsSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        // findFirst, not findUnique: Task 3's migration made `email`
        // non-unique (username is now the unique login identity). This is
        // a deliberate stopgap so the file type-checks against the new
        // schema, not a design decision — Task 10 replaces this whole
        // Credentials provider with the two-stage password + OTP/TOTP
        // flow, at which point this lookup goes away entirely.
        const user = await prisma.user.findFirst({
          where: { email: parsed.data.email.toLowerCase().trim() },
        });
        if (!user) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
});
