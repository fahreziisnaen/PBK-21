'use server';

import { revalidatePath } from 'next/cache';
import type { Grade, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireWriter } from '@/lib/roles';
import { getWritableActivity } from '@/lib/writable-activity';
import { parseAmount } from '@/lib/finance';
import { normalizePhone } from '@/lib/phone';
import { rp } from '@/lib/format';
import { fail, ok, type ActionResult } from '@/lib/action-result';

const GRADES: Grade[] = ['X', 'XI', 'XII'];
const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

/** Nama kelas dinormalkan sama seperti di master kelas: huruf besar, spasi tunggal. */
function normalizeClassName(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Kelas yang dipilih di form harus terdaftar di master kelas, dan tingkat
 * siswa mengikuti tingkat kelas itu — supaya "X-1" tidak pernah tercatat
 * sebagai tingkat XI karena salah pilih.
 */
async function resolveClass(raw: string, grade: Grade): Promise<{ className: string | null; grade: Grade } | { error: string }> {
  const name = normalizeClassName(raw);
  if (!name) return { className: null, grade };
  const found = await prisma.schoolClass.findUnique({ where: { name } });
  if (!found) return { error: `Kelas "${name}" belum terdaftar. Tambahkan dulu di Master Data › Kelas.` };
  return { className: found.name, grade: found.grade };
}

function refresh() {
  revalidatePath('/siswa');
  revalidatePath('/rekap');
  revalidatePath('/dashboard');
  revalidatePath('/master/kelas');
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
  const phoneRaw = str(fd, 'phone');
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const billing = str(fd, 'billing') ? parseAmount(fd.get('billing')) : activity.contribution;

  if (!nis) return fail('NIS wajib diisi.');
  if (!name) return fail('Nama siswa wajib diisi.');
  if (!GRADES.includes(str(fd, 'grade') as Grade)) return fail('Pilih tingkat X, XI, atau XII.');
  const cls = await resolveClass(str(fd, 'className'), str(fd, 'grade') as Grade);
  if ('error' in cls) return fail(cls.error);
  const { className, grade } = cls;
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
  const phoneRaw = str(fd, 'phone');
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const billing = parseAmount(fd.get('billing'));

  if (!name) return fail('Nama siswa wajib diisi.');
  if (!GRADES.includes(str(fd, 'grade') as Grade)) return fail('Pilih tingkat X, XI, atau XII.');
  const cls = await resolveClass(str(fd, 'className'), str(fd, 'grade') as Grade);
  if ('error' in cls) return fail(cls.error);
  const { className, grade } = cls;
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
    return fail(
      `${participant.student.name} sudah punya riwayat pembayaran di kegiatan ini, jadi tidak bisa dikeluarkan. ` +
        'Kuitansi yang dibatalkan pun tetap tersimpan sebagai catatan.',
    );
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
    else parsed.push({ nis, name, grade, className: className ? normalizeClassName(className) : null, phone });
  });
  if (errors.length > 0) return fail(errors.slice(0, 5).join(' '));

  // Kelas yang belum ada di master dibuat otomatis dari data impor. Kelas yang
  // sudah ada menentukan tingkat siswanya, sama seperti saat input manual.
  const classNames = [...new Set(parsed.map((r) => r.className).filter((c): c is string => !!c))];
  const existing = new Map((await prisma.schoolClass.findMany({ where: { name: { in: classNames } } })).map((c) => [c.name, c.grade]));
  let createdClasses = 0;
  for (const name of classNames) {
    if (existing.has(name)) continue;
    const grade = parsed.find((r) => r.className === name)!.grade;
    await prisma.schoolClass.create({ data: { name, grade } });
    existing.set(name, grade);
    createdClasses++;
  }
  for (const row of parsed) if (row.className) row.grade = existing.get(row.className)!;

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
  return ok(
    `${parsed.length} siswa diproses, ${added} baru didaftarkan ke ${activity.name}` +
      (createdClasses ? `, ${createdClasses} kelas baru dibuat.` : '.'),
  );
}

/**
 * Ubah tagihan banyak peserta sekaligus: seluruh kegiatan, satu tingkat, atau
 * satu kelas — supaya nominal yang berubah tidak perlu diedit satu per satu
 * untuk ratusan siswa.
 */
export async function updateBillingBulk(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();
  const target = await getWritableActivity();
  if ('error' in target) return fail(target.error);
  const { activity } = target;

  const scope = str(fd, 'scope');
  const amount = parseAmount(fd.get('amount'));
  if (!amount) return fail('Nominal tagihan harus lebih dari nol.');

  let where: Prisma.ParticipantWhereInput = { activityId: activity.id };
  let label = 'seluruh peserta';
  if (scope.startsWith('grade:')) {
    const grade = scope.slice(6) as Grade;
    if (!GRADES.includes(grade)) return fail('Tingkat tidak dikenal.');
    where = { ...where, student: { grade } };
    label = 'tingkat ' + grade;
  } else if (scope.startsWith('class:')) {
    const className = scope.slice(6);
    if (!className) return fail('Kelas tidak dikenal.');
    where = { ...where, student: { className } };
    label = 'kelas ' + className;
  } else if (scope !== 'all') {
    return fail('Pilih cakupan perubahan.');
  }

  const { count } = await prisma.participant.updateMany({ where, data: { billing: amount } });
  if (count === 0) return fail('Tidak ada peserta pada ' + label + '.');
  refresh();
  return ok('Tagihan ' + count + ' siswa (' + label + ') diubah menjadi ' + rp(amount) + '.');
}
