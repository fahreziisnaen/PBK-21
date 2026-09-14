'use server';

import { revalidatePath } from 'next/cache';
import type { ActivityStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireWriter } from '@/lib/roles';
import { writeAudit } from '@/lib/audit';
import { parseAmount, parseDateInput } from '@/lib/finance';
import { fail, ok, type ActionResult } from '@/lib/action-result';

const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();
const opt = (fd: FormData, key: string) => str(fd, key) || null;

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002';
}

// ---------- Kategori (kegiatan & pengeluaran punya bentuk yang sama) ----------

type CategoryKind = 'activity' | 'expense';

async function saveCategory(kind: CategoryKind, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = str(fd, 'id');
  const code = str(fd, 'code').toUpperCase();
  const name = str(fd, 'name');
  const description = opt(fd, 'description');
  if (!code || code.length > 10) return fail('Kode wajib diisi, maksimal 10 karakter.');
  if (!name) return fail('Nama kategori wajib diisi.');

  const data = { code, name, description };
  try {
    if (kind === 'activity') {
      if (id) await prisma.activityCategory.update({ where: { id }, data });
      else await prisma.activityCategory.create({ data });
    } else {
      if (id) await prisma.expenseCategory.update({ where: { id }, data });
      else await prisma.expenseCategory.create({ data });
    }
  } catch (e) {
    if (isUniqueViolation(e)) return fail(`Kode "${code}" sudah dipakai kategori lain.`);
    throw e;
  }
  revalidatePath(kind === 'activity' ? '/master/kategori-kegiatan' : '/master/kategori-pengeluaran');
  return ok(id ? 'Kategori diperbarui.' : 'Kategori ditambahkan.');
}

async function toggleCategory(kind: CategoryKind, id: string): Promise<ActionResult> {
  const user = await requireAdmin();
  const current =
    kind === 'activity'
      ? await prisma.activityCategory.findUnique({ where: { id } })
      : await prisma.expenseCategory.findUnique({ where: { id } });
  if (!current) return fail('Kategori tidak ditemukan.');
  const status = current.status === 'AKTIF' ? 'NONAKTIF' : 'AKTIF';
  if (kind === 'activity') await prisma.activityCategory.update({ where: { id }, data: { status } });
  else await prisma.expenseCategory.update({ where: { id }, data: { status } });
  await writeAudit({
    userId: user.id,
    action: status === 'NONAKTIF' ? 'category.deactivate' : 'category.activate',
    entity: kind === 'activity' ? 'ActivityCategory' : 'ExpenseCategory',
    entityId: id,
  });
  revalidatePath(kind === 'activity' ? '/master/kategori-kegiatan' : '/master/kategori-pengeluaran');
  return ok(status === 'NONAKTIF' ? 'Kategori dinonaktifkan.' : 'Kategori diaktifkan kembali.');
}

export async function saveActivityCategory(_: ActionResult, fd: FormData) {
  return saveCategory('activity', fd);
}
export async function saveExpenseCategory(_: ActionResult, fd: FormData) {
  return saveCategory('expense', fd);
}
export async function toggleActivityCategory(id: string) {
  return toggleCategory('activity', id);
}
export async function toggleExpenseCategory(id: string) {
  return toggleCategory('expense', id);
}

// ---------- Kegiatan ----------

const ACTIVITY_STATUSES: ActivityStatus[] = ['DRAFT', 'AKTIF', 'SELESAI', 'ARSIP'];

export async function saveActivity(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();
  const id = str(fd, 'id');
  const name = str(fd, 'name');
  const categoryId = str(fd, 'categoryId');
  const location = str(fd, 'location');
  const receiptPrefix = str(fd, 'receiptPrefix').toUpperCase();
  const startDate = parseDateInput(fd.get('startDate'));
  const endDate = parseDateInput(fd.get('endDate'));
  const contribution = parseAmount(fd.get('contribution'));
  const target = Number(str(fd, 'participantTarget') || '0');
  const status = (str(fd, 'status') || 'DRAFT') as ActivityStatus;

  if (!name) return fail('Nama kegiatan wajib diisi.');
  if (!categoryId) return fail('Pilih kategori kegiatan.');
  if (!startDate || !endDate) return fail('Tanggal mulai dan selesai wajib diisi.');
  if (endDate < startDate) return fail('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  if (!location) return fail('Lokasi wajib diisi.');
  if (!contribution) return fail('Kontribusi per siswa wajib diisi dan lebih dari nol.');
  if (!Number.isInteger(target) || target < 0) return fail('Target peserta harus bilangan bulat.');
  if (!/^[A-Z0-9-]{1,12}$/.test(receiptPrefix))
    return fail('Prefix kuitansi hanya huruf, angka, dan tanda hubung (mis. OC-X).');
  if (!ACTIVITY_STATUSES.includes(status)) return fail('Status tidak dikenal.');

  const data = {
    name,
    categoryId,
    year: startDate.getUTCFullYear(),
    startDate,
    endDate,
    location,
    description: opt(fd, 'description'),
    contribution,
    participantTarget: target,
    chairperson: opt(fd, 'chairperson'),
    status,
    receiptPrefix,
  };

  if (id) {
    const existing = await prisma.activity.findUnique({ where: { id } });
    if (!existing) return fail('Kegiatan tidak ditemukan.');
    if (existing.status === 'ARSIP' && status === 'ARSIP') return fail('Kegiatan yang diarsipkan tidak dapat diubah.');
    await prisma.activity.update({ where: { id }, data });
  } else {
    await prisma.activity.create({ data });
  }
  revalidatePath('/', 'layout');
  return ok(id ? 'Kegiatan diperbarui.' : 'Kegiatan ditambahkan.');
}

export async function archiveActivity(id: string): Promise<ActionResult> {
  const user = await requireAdmin();
  await prisma.activity.update({ where: { id }, data: { status: 'ARSIP' } });
  await writeAudit({ userId: user.id, action: 'activity.archive', entity: 'Activity', entityId: id });
  revalidatePath('/', 'layout');
  return ok('Kegiatan diarsipkan.');
}
