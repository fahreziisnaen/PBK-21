'use server';

import { revalidatePath } from 'next/cache';
import type { ActivityStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireWriter } from '@/lib/roles';
import { writeAudit } from '@/lib/audit';
import { parseAmount, parseDateInput } from '@/lib/finance';
import { fail, ok, type ActionResult } from '@/lib/action-result';
import { isUniqueViolation } from '@/lib/prisma-errors';

const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();
const opt = (fd: FormData, key: string) => str(fd, key) || null;

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
    // Kegiatan baru mengikuti tahun pelajaran yang sedang berjalan; bila belum
    // ada yang ditetapkan, dibiarkan kosong dan bisa dikaitkan belakangan.
    academicYearId: (await prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }))?.id ?? null,
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

// ---------- Hapus (hanya data yang belum dipakai) ----------
//
// Data yang sudah dipakai tidak dihapus: menghapusnya akan merusak riwayat
// transaksi dan laporan. Untuk itu ada nonaktifkan (kategori) dan arsipkan
// (kegiatan).

export async function deleteActivityCategory(id: string): Promise<ActionResult> {
  const user = await requireAdmin();
  const category = await prisma.activityCategory.findUnique({
    where: { id },
    include: { _count: { select: { activities: true } } },
  });
  if (!category) return fail('Kategori tidak ditemukan.');
  if (category._count.activities > 0)
    return fail(`"${category.name}" dipakai ${category._count.activities} kegiatan, jadi tidak bisa dihapus. Nonaktifkan saja.`);
  await prisma.activityCategory.delete({ where: { id } });
  await writeAudit({ userId: user.id, action: 'category.delete', entity: 'ActivityCategory', entityId: id, meta: { code: category.code } });
  revalidatePath('/master/kategori-kegiatan');
  return ok(`Kategori "${category.name}" dihapus.`);
}

export async function deleteExpenseCategory(id: string): Promise<ActionResult> {
  const user = await requireAdmin();
  const category = await prisma.expenseCategory.findUnique({
    where: { id },
    include: { _count: { select: { expenses: true } } },
  });
  if (!category) return fail('Kategori tidak ditemukan.');
  if (category._count.expenses > 0)
    return fail(`"${category.name}" dipakai ${category._count.expenses} transaksi, jadi tidak bisa dihapus. Nonaktifkan saja.`);
  await prisma.expenseCategory.delete({ where: { id } });
  await writeAudit({ userId: user.id, action: 'category.delete', entity: 'ExpenseCategory', entityId: id, meta: { code: category.code } });
  revalidatePath('/master/kategori-pengeluaran');
  return ok(`Kategori "${category.name}" dihapus.`);
}

export async function deleteActivity(id: string): Promise<ActionResult> {
  const user = await requireAdmin();
  const activity = await prisma.activity.findUnique({
    where: { id },
    include: { _count: { select: { participants: true, payments: true, expenses: true } } },
  });
  if (!activity) return fail('Kegiatan tidak ditemukan.');
  const { participants, payments, expenses } = activity._count;
  if (participants + payments + expenses > 0)
    return fail(`"${activity.name}" sudah punya peserta atau transaksi, jadi tidak bisa dihapus. Arsipkan saja.`);
  await prisma.activity.delete({ where: { id } });
  await writeAudit({ userId: user.id, action: 'activity.delete', entity: 'Activity', entityId: id, meta: { name: activity.name } });
  revalidatePath('/', 'layout');
  return ok(`Kegiatan "${activity.name}" dihapus.`);
}

// ---------- Kelas ----------

const GRADES = ['X', 'XI', 'XII'] as const;

export async function saveClass(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();
  const id = str(fd, 'id');
  const name = str(fd, 'name').toUpperCase().replace(/\s+/g, ' ');
  const grade = str(fd, 'grade') as (typeof GRADES)[number];
  const homeroomTeacher = opt(fd, 'homeroomTeacher');
  if (!name || name.length > 20) return fail('Nama kelas wajib diisi, maksimal 20 karakter (mis. X-1).');
  if (!GRADES.includes(grade)) return fail('Pilih tingkat X, XI, atau XII.');

  try {
    if (id) {
      const existing = await prisma.schoolClass.findUnique({ where: { id } });
      if (!existing) return fail('Kelas tidak ditemukan.');
      // Nama kelas tersimpan di data siswa, jadi mengganti nama atau tingkat
      // kelas ikut memperbarui semua siswanya dalam satu transaksi.
      await prisma.$transaction([
        prisma.schoolClass.update({ where: { id }, data: { name, grade, homeroomTeacher } }),
        prisma.student.updateMany({ where: { className: existing.name }, data: { className: name, grade } }),
      ]);
    } else {
      await prisma.schoolClass.create({ data: { name, grade, homeroomTeacher } });
    }
  } catch (e) {
    if (isUniqueViolation(e)) return fail(`Kelas "${name}" sudah ada.`);
    throw e;
  }
  revalidatePath('/master/kelas');
  revalidatePath('/siswa');
  revalidatePath('/rekap');
  return ok(id ? 'Kelas diperbarui.' : `Kelas ${name} ditambahkan.`);
}

export async function deleteClass(id: string): Promise<ActionResult> {
  const user = await requireWriter();
  const schoolClass = await prisma.schoolClass.findUnique({ where: { id } });
  if (!schoolClass) return fail('Kelas tidak ditemukan.');
  const students = await prisma.student.count({ where: { className: schoolClass.name } });
  if (students > 0)
    return fail(`Kelas ${schoolClass.name} masih punya ${students} siswa. Pindahkan siswanya ke kelas lain dulu.`);
  await prisma.schoolClass.delete({ where: { id } });
  await writeAudit({ userId: user.id, action: 'class.delete', entity: 'SchoolClass', entityId: id, meta: { name: schoolClass.name } });
  revalidatePath('/master/kelas');
  return ok(`Kelas ${schoolClass.name} dihapus.`);
}

/**
 * Menarik kelas yang sudah terpakai di data siswa ke master kelas.
 *
 * `Student.className` hanyalah kolom teks — tidak ada relasi yang memaksanya
 * cocok dengan tabel kelas. Versi aplikasi sebelum master kelas ada mengisinya
 * lewat isian bebas, sehingga setelah pemutakhiran siswa punya kelas sementara
 * masternya kosong: kelas lama tetap tampil, tetapi tidak bisa dipilih untuk
 * siswa baru karena formnya memakai daftar dari master.
 *
 * Tingkat tiap kelas diambil dari tingkat yang paling banyak dipakai siswa di
 * kelas itu — bukan dari tebakan pola nama, yang akan salah untuk penamaan
 * seperti "XI IPA 2" atau "AKL 1".
 */
export async function importClassesFromStudents(): Promise<ActionResult> {
  await requireWriter();

  const used = await prisma.student.groupBy({
    by: ['className', 'grade'],
    where: { className: { not: null } },
    _count: { _all: true },
  });
  if (used.length === 0) return fail('Belum ada siswa yang punya kelas untuk ditarik.');

  // Satu nama kelas bisa muncul dengan beberapa tingkat bila data lamanya tidak
  // konsisten; yang dipakai adalah tingkat dengan siswa terbanyak.
  const best = new Map<string, { grade: (typeof GRADES)[number]; count: number }>();
  for (const row of used) {
    const name = (row.className ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!name || name.length > 20) continue;
    const current = best.get(name);
    if (!current || row._count._all > current.count) {
      best.set(name, { grade: row.grade, count: row._count._all });
    }
  }
  if (best.size === 0) return fail('Belum ada siswa yang punya kelas untuk ditarik.');

  const existing = new Set((await prisma.schoolClass.findMany({ select: { name: true } })).map((c) => c.name));
  const toCreate = [...best.entries()].filter(([name]) => !existing.has(name));
  if (toCreate.length === 0) return fail('Semua kelas yang dipakai siswa sudah ada di master.');

  const { count } = await prisma.schoolClass.createMany({
    data: toCreate.map(([name, { grade }]) => ({ name, grade })),
    skipDuplicates: true,
  });

  revalidatePath('/master/kelas');
  revalidatePath('/siswa');
  revalidatePath('/rekap');
  return ok(`${count} kelas ditarik dari data siswa: ${toCreate.map(([n]) => n).slice(0, 8).join(', ')}${toCreate.length > 8 ? ', …' : ''}.`);
}
