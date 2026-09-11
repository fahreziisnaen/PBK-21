import type { DefaultSession } from 'next-auth';
import type { Role } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    /** `passwordStamp` is passwordChangedAt (ms, 0 if never) frozen at sign-in — see isSessionStale. */
    user: { id: string; role: Role; passwordStamp?: number } & DefaultSession['user'];
  }
  interface User {
    role: Role;
    passwordChangedAt?: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: Role;
    /** passwordChangedAt in ms, 0 if never — frozen at sign-in. */
    pwc?: number;
  }
}
