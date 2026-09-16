'use server';

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/roles';
import { requireUser } from '@/lib/auth-guard';
import { normalizePhone } from '@/lib/phone';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import { writeAudit } from '@/lib/audit';
import { readImageUpload } from '@/lib/upload';
import { fail, ok, type ActionResult } from '@/lib/action-result';

const ROLES: Role[] = ['SUPERADMIN', 'ADMIN', 'BENDAHARA', 'KEPALA_SEKOLAH'];
const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

export async function createUser(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const username = str(fd, 'username').toLowerCase();
  const name = str(fd, 'name');
  const role = str(fd, 'role') as Role;
  const phoneRaw = str(fd, 'phone');
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const password = String(fd.get('password') ?? '');

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return fail('Username 3–32 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.');
  if (!name) return fail('Nama wajib diisi.');
  if (!ROLES.includes(role)) return fail('Pilih peran.');
  if (role === 'SUPERADMIN' && actor.role !== 'SUPERADMIN') return fail('Hanya superadmin yang dapat membuat superadmin.');
  if (phoneRaw && !phone) return fail('Nomor telepon tidak valid. Contoh: 081234567890.');
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Sandi awal minimal ${MIN_PASSWORD_LENGTH} karakter.`);

  if (await prisma.user.findUnique({ where: { username } })) return fail(`Username "${username}" sudah dipakai.`);

  const user = await prisma.user.create({
    data: {
      username,
      name,
      role,
      phone,
      passwordHash: await bcrypt.hash(password, 10),
      // Sandi awal diketahui admin — pengguna wajib menggantinya saat login pertama.
      mustChangePassword: true,
    },
  });
  await writeAudit({ userId: actor.id, action: 'user.create', entity: 'User', entityId: user.id, meta: { username, role } });
  revalidatePath('/pengguna');
  return ok(`Pengguna ${username} dibuat. Berikan sandi awalnya; ia akan diminta menggantinya saat login pertama.`);
}

export async function updateUser(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const id = str(fd, 'id');
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return fail('Pengguna tidak ditemukan.');

  const name = str(fd, 'name');
  const role = str(fd, 'role') as Role;
  const phoneRaw = str(fd, 'phone');
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

  if (!name) return fail('Nama wajib diisi.');
  if (!ROLES.includes(role)) return fail('Pilih peran.');
  if ((role === 'SUPERADMIN' || target.role === 'SUPERADMIN') && actor.role !== 'SUPERADMIN')
    return fail('Hanya superadmin yang dapat mengubah akun superadmin.');
  if (target.id === actor.id && role !== target.role) return fail('Anda tidak dapat mengubah peran akun sendiri.');
  if (phoneRaw && !phone) return fail('Nomor telepon tidak valid. Contoh: 081234567890.');

  await prisma.user.update({ where: { id }, data: { name, role, phone } });
  if (role !== target.role)
    await writeAudit({ userId: actor.id, action: 'user.role_change', entity: 'User', entityId: id, meta: { from: target.role, to: role } });
  revalidatePath('/pengguna');
  return ok('Data pengguna diperbarui.');
}

export async function resetUserPassword(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const id = str(fd, 'id');
  const password = String(fd.get('password') ?? '');
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return fail('Pengguna tidak ditemukan.');
  if (target.role === 'SUPERADMIN' && actor.role !== 'SUPERADMIN') return fail('Hanya superadmin yang dapat mereset sandi superadmin.');
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Sandi sementara minimal ${MIN_PASSWORD_LENGTH} karakter.`);

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true, passwordChangedAt: new Date() },
  });
  await writeAudit({ userId: actor.id, action: 'user.password_reset', entity: 'User', entityId: id });
  revalidatePath('/pengguna');
  return ok(`Sandi ${target.username} direset. Ia akan diminta menggantinya saat login.`);
}

export async function toggleUserActive(id: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return fail('Pengguna tidak ditemukan.');
  if (target.id === actor.id) return fail('Anda tidak dapat menonaktifkan akun sendiri.');
  if (target.role === 'SUPERADMIN' && actor.role !== 'SUPERADMIN') return fail('Hanya superadmin yang dapat mengubah akun superadmin.');

  const isActive = !target.isActive;
  await prisma.user.update({ where: { id }, data: { isActive } });
  await writeAudit({ userId: actor.id, action: isActive ? 'user.activate' : 'user.deactivate', entity: 'User', entityId: id });
  revalidatePath('/pengguna');
  return ok(isActive ? `${target.username} diaktifkan kembali.` : `${target.username} dinonaktifkan.`);
}

export async function resetUserTotp(id: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return fail('Pengguna tidak ditemukan.');
  if (target.role === 'SUPERADMIN' && actor.role !== 'SUPERADMIN') return fail('Hanya superadmin yang dapat mengubah akun superadmin.');

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { totpSecret: null, totpEnabledAt: null } }),
    // Tutup challenge yang masih hidup. Login tahap 2 menentukan akun tanpa
    // faktor kedua dari kondisi akun saat kode diperiksa; tanpa baris ini,
    // challenge TOTP yang terbit sebelum reset bisa diloloskan tanpa kode.
    prisma.authChallenge.updateMany({ where: { userId: id, consumedAt: null }, data: { consumedAt: new Date() } }),
  ]);
  await writeAudit({ userId: actor.id, action: 'user.totp_reset', entity: 'User', entityId: id });
  revalidatePath('/pengguna');
  return ok(`2FA ${target.username} direset. Ia akan diminta mendaftarkannya lagi.`);
}

/** Profil sendiri: nama dan telepon. */
export async function updateOwnProfile(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const name = str(fd, 'name');
  const phoneRaw = str(fd, 'phone');
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (!name) return fail('Nama wajib diisi.');
  if (phoneRaw && !phone) return fail('Nomor telepon tidak valid. Contoh: 081234567890.');
  await prisma.user.update({ where: { id: me.id }, data: { name, phone } });
  revalidatePath('/profil');
  return ok('Profil diperbarui.');
}

/** Identitas sekolah untuk kop kuitansi dan laporan. */
export async function updateSchool(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = str(fd, 'name');
  const fiscalYear = Number(str(fd, 'fiscalYear'));
  if (!name) return fail('Nama sekolah wajib diisi.');
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) return fail('Tahun anggaran tidak valid.');
  await prisma.school.upsert({
    where: { id: 'default' },
    create: { id: 'default', name, address: str(fd, 'address') || null, npsn: str(fd, 'npsn') || null, fiscalYear },
    update: { name, address: str(fd, 'address') || null, npsn: str(fd, 'npsn') || null, fiscalYear },
  });
  revalidatePath('/', 'layout');
  return ok('Identitas sekolah disimpan.');
}

/** Tanda tangan yang tercetak di kuitansi dan laporan, milik masing-masing pengguna. */
export async function updateSignature(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  if (String(fd.get('remove') ?? '') === '1') {
    await prisma.user.update({ where: { id: me.id }, data: { signatureImage: null } });
    revalidatePath('/profil');
    return ok('Tanda tangan dihapus.');
  }
  const image = await readImageUpload(fd.get('signature'), 512 * 1024);
  if (!image) return fail('Pilih berkas gambar tanda tangan lebih dulu.');
  if ('error' in image) return fail(image.error);
  await prisma.user.update({ where: { id: me.id }, data: { signatureImage: image.dataUri } });
  revalidatePath('/profil');
  return ok('Tanda tangan disimpan, dan akan tercetak di kuitansi serta laporan Anda.');
}
