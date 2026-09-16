'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireWriter } from '@/lib/roles';
import { academicYearName, nextGrade, type Grade } from '@/lib/academic-year';
import { fail, ok, type ActionResult } from '@/lib/action-result';

const CONFIRM = 'NAIK KELAS';

/**
 * Naik kelas: menaikkan tingkat seluruh siswa aktif, memindahkan mereka ke
 * kelas tujuan yang dipilih, meluluskan kelas XII, lalu membuka tahun
 * pelajaran berikutnya.
 *
 * Seluruhnya dalam satu transaksi. Ini menulis ke setiap baris siswa sekolah
 * sekaligus; berhenti di tengah akan meninggalkan sebagian siswa di tingkat
 * baru dan sebagian di tingkat lama, tanpa cara mudah mengetahui yang mana.
 *
 * Bentuk masukan dari formnya:
 *   confirm            teks konfirmasi, harus "NAIK KELAS"
 *   tinggal            id siswa yang TIDAK naik (boleh berulang)
 *   tujuan:<KELAS>     nama kelas tujuan untuk siswa dari kelas itu, boleh kosong
 */
export async function promoteStudents(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();

  if (String(fd.get('confirm') ?? '').trim().toUpperCase() !== CONFIRM) {
    return fail(`Ketik ${CONFIRM} untuk mengonfirmasi.`);
  }

  const current = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!current) {
    return fail('Belum ada tahun pelajaran berjalan. Tetapkan dulu di Master Data › Tahun Pelajaran.');
  }

  const held = new Set(fd.getAll('tinggal').map((v) => String(v)));
  const destinationFor = new Map<string, string>();
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith('tujuan:')) continue;
    const from = key.slice('tujuan:'.length);
    const to = String(value).trim();
    if (to) destinationFor.set(from, to);
  }

  const students = await prisma.student.findMany({
    where: { status: 'AKTIF' },
    select: { id: true, grade: true, className: true },
  });
  if (students.length === 0) return fail('Belum ada siswa aktif untuk dinaikkan.');

  // Kelas tujuan harus benar-benar ada di master, diperiksa sekali di depan —
  // kalau baru ketahuan di tengah transaksi, sebagian siswa sudah tersentuh.
  const wanted = [...new Set(destinationFor.values())];
  const known = new Set((await prisma.schoolClass.findMany({ where: { name: { in: wanted } } })).map((c) => c.name));
  const missing = wanted.filter((n) => !known.has(n));
  if (missing.length > 0) {
    return fail(`Kelas tujuan belum terdaftar di master: ${missing.join(', ')}.`);
  }

  const promoted: { id: string; grade: Grade; className: string | null }[] = [];
  const graduated: string[] = [];

  for (const s of students) {
    if (held.has(s.id)) continue; // tinggal kelas: tingkat dan kelasnya tidak diubah
    const next = nextGrade(s.grade as Grade);
    if (next === null) {
      graduated.push(s.id);
      continue;
    }
    // Tanpa kelas tujuan, siswanya naik tingkat tetapi kelasnya dikosongkan —
    // lebih jujur daripada meninggalkannya di kelas tingkat lama, dan mereka
    // bisa ditemukan lewat filter "Tanpa kelas" di Induk Siswa.
    const to = s.className ? (destinationFor.get(s.className) ?? null) : null;
    promoted.push({ id: s.id, grade: next, className: to });
  }

  const nextYearStart = current.startYear + 1;
  const nextYearName = academicYearName(nextYearStart);

  await prisma.$transaction(async (tx) => {
    // Dikelompokkan supaya jumlah perintahnya tetap kecil walau siswanya
    // ribuan: satu updateMany per pasangan (tingkat baru, kelas baru).
    const groups = new Map<string, { grade: Grade; className: string | null; ids: string[] }>();
    for (const p of promoted) {
      const key = `${p.grade}|${p.className ?? ''}`;
      const g = groups.get(key) ?? { grade: p.grade, className: p.className, ids: [] };
      g.ids.push(p.id);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      await tx.student.updateMany({
        where: { id: { in: g.ids } },
        data: { grade: g.grade, className: g.className },
      });
    }

    if (graduated.length > 0) {
      await tx.student.updateMany({
        where: { id: { in: graduated } },
        data: { status: 'ALUMNI', graduatedAt: new Date(), graduatedYear: current.name },
      });
    }

    const existing = await tx.academicYear.findUnique({ where: { startYear: nextYearStart } });
    const next = existing ?? (await tx.academicYear.create({ data: { name: nextYearName, startYear: nextYearStart } }));
    await tx.academicYear.updateMany({ where: { isActive: true }, data: { isActive: false } });
    await tx.academicYear.update({ where: { id: next.id }, data: { isActive: true } });
  });

  revalidatePath('/', 'layout');
  return ok(
    `${promoted.length} siswa naik kelas, ${graduated.length} lulus, ${held.size} tinggal kelas. ` +
      `Tahun pelajaran berjalan kini ${nextYearName}.`,
  );
}
