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
import { isUniqueViolation } from '@/lib/prisma-errors';

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
 * Ubah tagihan satu peserta. Hanya tagihan: nama, tingkat, kelas, dan telepon
 * adalah data induk siswa dan diubah di Master Data › Data Siswa. Dulu tombol
 * "Edit" di Data Peserta ikut mengubah data induk itu, sehingga membetulkan
 * tagihan satu kegiatan bisa diam-diam mengganti data siswa di semua kegiatan.
 */
export async function updateParticipantBilling(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();
  const participantId = str(fd, 'participantId');
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: { activity: true, student: { select: { name: true } } },
  });
  if (!participant) return fail('Peserta tidak ditemukan.');
  if (participant.activity.status === 'ARSIP') return fail('Kegiatan ini sudah diarsipkan dan hanya bisa dibaca.');

  const billing = parseAmount(fd.get('billing'));
  if (!billing) return fail('Tagihan harus lebih dari nol.');

  await prisma.participant.update({ where: { id: participantId }, data: { billing } });
  refresh();
  revalidatePath(`/siswa/${participant.studentId}`);
  return ok(`Tagihan ${participant.student.name} diubah menjadi ${rp(billing)}.`);
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
 * Impor banyak siswa sekaligus ke Data Siswa dari teks yang ditempel dari
 * Excel: satu baris per siswa, kolom NIS, Nama, Tingkat, Kelas (opsional),
 * Telepon (opsional), dipisah tab, titik koma, atau koma.
 *
 * Hanya mengisi data induk — tidak mendaftarkan siapa pun ke kegiatan. Karena
 * itu impor juga tidak lagi butuh kegiatan aktif: data siswa sekolah tidak
 * bergantung pada ada atau tidaknya kegiatan. Pendaftaran ke kegiatan dilakukan
 * terpisah lewat Daftarkan Siswa di Data Peserta.
 *
 * NIS yang sudah ada diperbarui, bukan digandakan; status alumni dibiarkan.
 */
export async function importStudents(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();

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

  // Dihitung sebelum ditulis, supaya pesannya bisa membedakan siswa baru dari
  // siswa lama yang datanya diperbarui — dua hal yang sangat berbeda bagi
  // orang yang baru saja menempel ratusan baris.
  const known = new Set(
    (await prisma.student.findMany({ where: { nis: { in: parsed.map((r) => r.nis) } }, select: { nis: true } })).map(
      (st) => st.nis,
    ),
  );
  for (const row of parsed) {
    await prisma.student.upsert({
      where: { nis: row.nis },
      create: row,
      update: { name: row.name, grade: row.grade, className: row.className, phone: row.phone },
    });
  }
  const created = parsed.filter((r) => !known.has(r.nis)).length;
  refresh();
  revalidatePath('/master/siswa');
  return ok(
    `${parsed.length} baris diproses: ${created} siswa baru, ${parsed.length - created} diperbarui` +
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

/**
 * Keluarkan beberapa peserta sekaligus dari kegiatan aktif. Peserta yang
 * sudah punya kuitansi dilewati, bukan menggagalkan seluruh permintaan —
 * memilih 40 siswa lalu ditolak semuanya karena satu di antaranya pernah
 * membayar hanya memaksa pengguna menebak siswa mana penyebabnya.
 */
export async function removeParticipants(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();
  const target = await getWritableActivity();
  if ('error' in target) return fail(target.error);
  const { activity } = target;

  const ids = fd.getAll('ids').map((v) => String(v)).filter(Boolean);
  if (ids.length === 0) return fail('Pilih dulu siswa yang akan dikeluarkan.');

  const participants = await prisma.participant.findMany({
    where: { id: { in: ids }, activityId: activity.id },
    include: { student: { select: { name: true } }, _count: { select: { payments: true } } },
  });
  if (participants.length === 0) return fail('Peserta tidak ditemukan di kegiatan ini.');

  const removable = participants.filter((p) => p._count.payments === 0);
  const blocked = participants.filter((p) => p._count.payments > 0);
  if (removable.length === 0)
    return fail(
      blocked.length === 1
        ? `${blocked[0].student.name} sudah punya riwayat pembayaran, jadi tidak bisa dikeluarkan.`
        : `${blocked.length} siswa terpilih sudah punya riwayat pembayaran, jadi tidak ada yang bisa dikeluarkan.`,
    );

  await prisma.participant.deleteMany({ where: { id: { in: removable.map((p) => p.id) } } });
  refresh();
  const note = blocked.length > 0 ? ` ${blocked.length} dilewati karena sudah ada pembayaran.` : '';
  return ok(`${removable.length} siswa dikeluarkan dari ${activity.name}.` + note);
}

/**
 * Daftarkan siswa terpilih ke kegiatan aktif. Siswa yang sudah terdaftar
 * dilewati diam-diam, sehingga mencentang ulang tidak menimbulkan galat.
 */
export async function enrollStudents(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();
  const target = await getWritableActivity();
  if ('error' in target) return fail(target.error);
  const { activity } = target;

  const ids = fd.getAll('studentIds').map((v) => String(v)).filter(Boolean);
  if (ids.length === 0) return fail('Pilih dulu siswa yang akan didaftarkan.');

  const students = await prisma.student.findMany({
    where: { id: { in: ids }, status: 'AKTIF', participations: { none: { activityId: activity.id } } },
    select: { id: true },
  });
  if (students.length === 0) return fail('Semua siswa yang dipilih sudah terdaftar di kegiatan ini.');

  await prisma.participant.createMany({
    data: students.map((s) => ({ activityId: activity.id, studentId: s.id, billing: activity.contribution })),
    skipDuplicates: true,
  });
  refresh();
  return ok(`${students.length} siswa didaftarkan ke ${activity.name} dengan tagihan ${rp(activity.contribution)}.`);
}

/**
 * Simpan siswa di data induk — lepas dari kegiatan mana pun.
 *
 * `addStudent` selalu sekaligus mendaftarkan siswa ke kegiatan aktif, jadi ia
 * tidak bisa dipakai untuk membetulkan data siswa yang belum ikut kegiatan
 * apa pun. Tanpa jalur ini, siswa seperti itu tidak terlihat dan tidak bisa
 * disunting di mana pun.
 */
export async function saveStudentMaster(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireWriter();
  const id = str(fd, 'id');
  const nis = str(fd, 'nis');
  const name = str(fd, 'name');
  if (!nis) return fail('NIS wajib diisi.');
  if (!name) return fail('Nama siswa wajib diisi.');
  if (!GRADES.includes(str(fd, 'grade') as Grade)) return fail('Pilih tingkat X, XI, atau XII.');

  const cls = await resolveClass(str(fd, 'className'), str(fd, 'grade') as Grade);
  if ('error' in cls) return fail(cls.error);

  const phoneRaw = str(fd, 'phone');
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return fail('Nomor telepon tidak valid. Contoh: 081234567890.');

  try {
    if (id) {
      await prisma.student.update({
        where: { id },
        data: { nis, name, grade: cls.grade, className: cls.className, phone },
      });
    } else {
      await prisma.student.create({
        data: { nis, name, grade: cls.grade, className: cls.className, phone },
      });
    }
  } catch (e) {
    if (isUniqueViolation(e)) return fail(`NIS ${nis} sudah dipakai siswa lain.`);
    throw e;
  }
  refresh();
  revalidatePath('/master/siswa');
  return ok(`Data ${name} disimpan.`);
}

/** Hapus siswa dari data induk — hanya bila ia belum pernah ikut kegiatan. */
export async function deleteStudentMaster(id: string): Promise<ActionResult> {
  await requireWriter();
  const student = await prisma.student.findUnique({
    where: { id },
    include: { _count: { select: { participations: true } } },
  });
  if (!student) return fail('Siswa tidak ditemukan.');
  if (student._count.participations > 0)
    return fail(
      `${student.name} sudah terdaftar di ${student._count.participations} kegiatan, jadi tidak bisa dihapus. ` +
        'Keluarkan dulu dari kegiatannya.',
    );

  await prisma.student.delete({ where: { id } });
  refresh();
  revalidatePath('/master/siswa');
  return ok(`${student.name} dihapus dari data induk siswa.`);
}
