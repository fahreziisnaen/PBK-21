import type { Role } from '@prisma/client';

export const SEED_ADMIN: {
  username: string;
  name: string;
  role: Role;
  phone: string | null;
} = {
  username: 'admin',
  name: 'Administrator',
  role: 'SUPERADMIN',
  phone: null,
};
