import type { Role } from '@prisma/client';
import { requireRole } from '@/lib/auth-guard';

/** Spec §2: Bendahara ke atas boleh mencatat transaksi, siswa, dan kegiatan. */
export const WRITER_ROLES: Role[] = ['SUPERADMIN', 'ADMIN', 'BENDAHARA'];
/** Master data kategori, arsip kegiatan, dan kelola user. */
export const ADMIN_ROLES: Role[] = ['SUPERADMIN', 'ADMIN'];

export const requireWriter = () => requireRole(...WRITER_ROLES);
export const requireAdmin = () => requireRole(...ADMIN_ROLES);

export function canWrite(role: Role): boolean {
  return WRITER_ROLES.includes(role);
}
export function isAdmin(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}
