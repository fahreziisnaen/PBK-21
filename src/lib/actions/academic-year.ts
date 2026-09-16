'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireWriter } from '@/lib/roles';
import { academicYearName, academicYearOf, parseAcademicYear } from '@/lib/academic-year';
import { isUniqueViolation } from '@/lib/prisma-errors';
import { fail, ok, type ActionResult } from '@/lib/action-result';

function refresh() {
  revalidatePath('/master/tahun-pelajaran');
  revalidatePath('/master/kegiatan');
  revalidatePath('/laporan/keuangan');
  revalidatePath('/laporan/pembayaran');
  revalidatePath('/', 'layout');
}

/** Tambah tahun pelajaran secara manual, mis. saat memulai pemakaian aplikasi. */
export async function saveAcademicYear(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();
  const raw = String(fd.get('name') ?? '').trim();
  const startYear = parseAcademicYear(raw);
  if (startYear === null) {
    return fail('Tahun pelajaran harus berbentuk 2026/2027 — dua tahun berurutan.');
  }

  try {
    await prisma.academicYear.create({
      data: { name: academicYearName(startYear), startYear },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(`Tahun pelajaran ${academicYearName(startYear)} sudah ada.`);
    throw e;
  }
  refresh();
  return ok(`Tahun pelajaran ${academicYearName(startYear)} ditambahkan.`);
}

/**
 * Jadikan satu tahun pelajaran sebagai yang berjalan. Dilakukan dalam satu
 * transaksi: menonaktifkan yang lain lebih dulu lalu mengaktifkan yang dipilih,
 * supaya tidak pernah ada dua tahun aktif sekaligus meski dua orang menekan
 * tombolnya bersamaan.
 */
export async function setActiveAcademicYear(id: string): Promise<ActionResult> {
  await requireWriter();
  const target = await prisma.academicYear.findUnique({ where: { id } });
  if (!target) return fail('Tahun pelajaran tidak ditemukan.');

  await prisma.$transaction([
    prisma.academicYear.updateMany({ where: { isActive: true }, data: { isActive: false } }),
    prisma.academicYear.update({ where: { id }, data: { isActive: true } }),
  ]);
  refresh();
  return ok(`Tahun pelajaran berjalan kini ${target.name}.`);
}

/**
 * Kaitkan kegiatan lama ke tahun pelajaran menurut tanggal mulainya, dan buat
 * tahun pelajaran yang belum ada.
 *
 * Kegiatan yang dibuat sebelum fitur ini hanya menyimpan tahun kalender, jadi
 * tanpa ini daftar kegiatan per tahun pelajaran akan kosong sementara
 * kegiatannya jelas ada.
 */
export async function backfillActivityYears(): Promise<ActionResult> {
  await requireWriter();
  const loose = await prisma.activity.findMany({
    where: { academicYearId: null },
    select: { id: true, startDate: true },
  });
  if (loose.length === 0) return fail('Semua kegiatan sudah punya tahun pelajaran.');

  const needed = new Set(loose.map((a) => academicYearOf(a.startDate)));
  const existing = await prisma.academicYear.findMany({ where: { startYear: { in: [...needed] } } });
  const byStart = new Map(existing.map((y) => [y.startYear, y]));

  for (const startYear of needed) {
    if (byStart.has(startYear)) continue;
    const created = await prisma.academicYear.create({
      data: { name: academicYearName(startYear), startYear },
    });
    byStart.set(startYear, created);
  }

  let linked = 0;
  for (const activity of loose) {
    const year = byStart.get(academicYearOf(activity.startDate));
    if (!year) continue;
    await prisma.activity.update({ where: { id: activity.id }, data: { academicYearId: year.id } });
    linked += 1;
  }

  // Tanpa satu pun tahun aktif, penyaring di seluruh aplikasi tidak punya
  // nilai baku; yang terbaru dijadikan berjalan.
  const anyActive = await prisma.academicYear.count({ where: { isActive: true } });
  if (anyActive === 0) {
    const latest = await prisma.academicYear.findFirst({ orderBy: { startYear: 'desc' } });
    if (latest) await prisma.academicYear.update({ where: { id: latest.id }, data: { isActive: true } });
  }

  refresh();
  return ok(`${linked} kegiatan dikaitkan ke tahun pelajarannya.`);
}
