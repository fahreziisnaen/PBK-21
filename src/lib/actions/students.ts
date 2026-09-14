'use server';

import { revalidatePath } from 'next/cache';
import type { Grade } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireWriter } from '@/lib/roles';
import { getWritableActivity } from '@/lib/writable-activity';
import { parseAmount } from '@/lib/finance';
import { normalizePhone } from '@/lib/phone';
import { fail, ok, type ActionResult } from '@/lib/action-result';

const GRADES: Grade[] = ['X', 'XI', 'XII'];
const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

function refresh() {
  revalidatePath('/siswa');
  revalidatePath('/rekap');
  revalidatePath('/dashboard');
}

/**
 * Tambah siswa ke kegiatan aktif. Siswa disimpan sekali (NIS unik) lalu
 * didaftarkan sebagai peserta; kalau NIS sudah ada, data siswanya dipakai
 * ulang dan diperbarui — tidak diinput dua kali untuk kegiatan berbeda.
 */
export async function addStudent(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();
  const target = await getWritableActivity();
  if ('error' in target) return fail(target.error);
  const { activity } = target;

  const nis = str(fd, 'nis');
  const name = str(fd, 'name');
  const grade = str(fd, 'grade') as Grade;
  const className = str(fd, 'className') || null;
  const phoneRaw = str(fd, 'phone');
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const billing = str(fd, 'billing') ? parseAmount(fd.get('billing')) : activity.contribution;

  if (!nis) return fail('NIS wajib diisi.');
  if (!name) return fail('Nama siswa wajib diisi.');
  if (!GRADES.includes(grade)) return fail('Pilih tingkat X, XI, atau XII.');
  if (phoneRaw && !phone) return fail('Nomor telepon tidak valid. Contoh: 081234567890.');
  if (!billing) return fail('Tagihan harus lebih dari nol.');

  const student = await prisma.student.upsert({
    where: { nis },
    create: { nis, name, grade, className, phone },
    update: { name, grade, className, phone },
  });
  const already = await prisma.participant.findUnique({
    where: { activityId_studentId: { activityId: activity.id, studentId: student.id } },
  });
  if (already) return fail(`${student.name} (NIS ${nis}) sudah terdaftar di kegiatan ini.`);

  await prisma.participant.create({ data: { activityId: activity.id, studentId: student.id, billing } });
  refresh();
  return ok(`${student.name} ditambahkan ke ${activity.name}.`);
}

/** Ubah data siswa dan tagihannya di kegiatan aktif. */
export async function updateParticipant(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();
  const participantId = str(fd, 'participantId');
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { activity: true },
  });
  if (!participant) return fail('Peserta tidak ditemukan.');
  if (participant.activity.status === 'ARSIP') return fail('Kegiatan ini sudah diarsipkan dan hanya bisa dibaca.');

  const name = str(fd, 'name');
  const grade = str(fd, 'grade') as Grade;
  const className = str(fd, 'className') || null;
  const phoneRaw = str(fd, 'phone');
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const billing = parseAmount(fd.get('billing'));

  if (!name) return fail('Nama siswa wajib diisi.');
  if (!GRADES.includes(grade)) return fail('Pilih tingkat X, XI, atau XII.');
  if (phoneRaw && !phone) return fail('Nomor telepon tidak valid. Contoh: 081234567890.');
  if (!billing) return fail('Tagihan harus lebih dari nol.');

  await prisma.$transaction([
    prisma.student.update({ where: { id: participant.studentId }, data: { name, grade, className, phone } }),
    prisma.participant.update({ where: { id: participantId }, data: { billing } }),
  ]);
  refresh();
  revalidatePath(`/siswa/${participant.studentId}`);
  return ok('Data siswa diperbarui.');
}

/** Daftarkan semua siswa satu tingkat yang belum menjadi peserta kegiatan aktif. */
export async function enrollGrade(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();
  const target = await getWritableActivity();
  if ('error' in target) return fail(target.error);
  const { activity } = target;
  const grade = str(fd, 'grade') as Grade;
  if (!GRADES.includes(grade)) return fail('Pilih tingkat.');

  const students = await prisma.student.findMany({
    where: { grade, participations: { none: { activityId: activity.id } } },
    select: { id: true },
  });
  if (students.length === 0) return fail(`Semua siswa tingkat ${grade} sudah terdaftar, atau belum ada data siswanya.`);

  await prisma.participant.createMany({
    data: students.map((s) => ({ activityId: activity.id, studentId: s.id, billing: activity.contribution })),
    skipDuplicates: true,
  });
  refresh();
  return ok(`${students.length} siswa tingkat ${grade} didaftarkan.`);
}

/** Keluarkan peserta dari kegiatan — hanya bila belum pernah ada pembayaran. */
export async function removeParticipant(participantId: string): Promise<ActionResult> {
  await requireWriter();
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { activity: true, student: true, _count: { select: { payments: true } } },
  });
  if (!participant) return fail('Peserta tidak ditemukan.');
  if (participant.activity.status === 'ARSIP') return fail('Kegiatan ini sudah diarsipkan dan hanya bisa dibaca.');
  if (participant._count.payments > 0)
    return fail(`${participant.student.name} sudah punya riwayat pembayaran, jadi tidak bisa dikeluarkan.`);
  await prisma.participant.delete({ where: { id: participantId } });
  refresh();
  return ok(`${participant.student.name} dikeluarkan dari kegiatan.`);
}

/**
 * Impor banyak siswa sekaligus dari teks yang ditempel dari Excel: satu baris
 * per siswa, kolom NIS, Nama, Tingkat, Kelas (opsional), Telepon (opsional),
 * dipisah tab, titik koma, atau koma. Semua langsung didaftarkan ke kegiatan aktif.
 */
export async function importStudents(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();
  const target = await getWritableActivity();
  if ('error' in target) return fail(target.error);
  const { activity } = target;

  const lines = str(fd, 'rows')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return fail('Tempel data siswa lebih dulu.');

  const errors: string[] = [];
  const parsed: { nis: string; name: string; grade: Grade; className: string | null; phone: string | null }[] = [];
  lines.forEach((line, i) => {
    const cols = line.split(/\t|;|,/).map((c) => c.trim());
    const [nis = '', name = '', gradeRaw = '', className = '', phoneRaw = ''] = cols;
    if (/^nis$/i.test(nis)) return; // baris judul
    const grade = gradeRaw.toUpperCase() as Grade;
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    if (!nis || !name) errors.push(`Baris ${i + 1}: NIS dan nama wajib.`);
    else if (!GRADES.includes(grade)) errors.push(`Baris ${i + 1}: tingkat harus X, XI, atau XII.`);
    else parsed.push({ nis, name, grade, className: className || null, phone });
  });
  if (errors.length > 0) return fail(errors.slice(0, 5).join(' '));

  let added = 0;
  for (const row of parsed) {
    const student = await prisma.student.upsert({
      where: { nis: row.nis },
      create: row,
      update: { name: row.name, grade: row.grade, className: row.className, phone: row.phone },
    });
    const result = await prisma.participant.createMany({
      data: [{ activityId: activity.id, studentId: student.id, billing: activity.contribution }],
      skipDuplicates: true,
    });
    added += result.count;
  }
  refresh();
  return ok(`${parsed.length} siswa diproses, ${added} baru didaftarkan ke ${activity.name}.`);
}
