import type { DefaultSession } from 'next-auth';
import type { Role } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    /** `passwordStamp` is passwordChangedAt (ms, 0 if never) frozen at sign-in — see isSessionStale. */
    user: {
      id: string;
      role: Role;
      passwordStamp?: number;
      /** "Ingat saya" saat masuk, dan waktu masuknya — lihat isSessionExpired. */
      remember?: boolean;
      loginAt?: number;
    } & DefaultSession['user'];
  }
  interface User {
    role: Role;
    passwordChangedAt?: number;
    remember?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: Role;
    /** passwordChangedAt in ms, 0 if never — frozen at sign-in. */
    pwc?: number;
    /** "Ingat saya", and the sign-in time in ms — both frozen at sign-in. */
    rem?: boolean;
    lat?: number;
  }
}
