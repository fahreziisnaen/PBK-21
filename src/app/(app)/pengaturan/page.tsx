import Link from 'next/link';
import { PageHead } from '@/components/shell/PageHead';
import { Badge } from '@/components/ui/Badge';
import { SaveForm } from '@/components/ui/SaveForm';
import { requireUser } from '@/lib/auth-guard';
import { isAdmin } from '@/lib/roles';
import { getActiveActivity } from '@/lib/activity-context';
import { prisma } from '@/lib/prisma';
import { updateSchool } from '@/lib/actions/users';
import { isoDate } from '@/lib/finance';
import { fdateLong, padSeq, rp } from '@/lib/format';
import { card, input, label } from '@/lib/ui';

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2.5 text-[13px] last:border-0">
      <span className="text-gray-500">{k}</span>
      <span className="text-right font-semibold text-gray-900">{v}</span>
    </div>
  );
}

export default async function PengaturanPage() {
  const user = await requireUser();
  const admin = isAdmin(user.role);
  const [school, activity] = await Promise.all([prisma.school.findFirst(), getActiveActivity()]);
  const [lastPayment, lastExpense] = activity
    ? await Promise.all([
        prisma.payment.aggregate({ where: { activityId: activity.id }, _max: { seq: true } }),
        prisma.expense.aggregate({ where: { activityId: activity.id }, _max: { seq: true } }),
      ])
    : [null, null];

  return (
    <>
      <PageHead pathname="/pengaturan" activity={activity} />
      <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
        <div className={`${card} p-6`}>
          <h2 className="mb-1 text-[15px] font-bold text-gray-900">Identitas Sekolah</h2>
          <p className="mb-4 text-[12.5px] text-gray-500">Dipakai sebagai kop pada kuitansi dan laporan.</p>
          <SaveForm action={updateSchool} disabled={!admin}>
            <div>
              <label className={label} htmlFor="name">Nama Sekolah</label>
              <input id="name" name="name" required defaultValue={school?.name ?? ''} className={input} disabled={!admin} />
            </div>
            <div>
              <label className={label} htmlFor="address">Alamat</label>
              <input id="address" name="address" defaultValue={school?.address ?? ''} className={input} disabled={!admin} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="npsn">NPSN</label>
                <input id="npsn" name="npsn" defaultValue={school?.npsn ?? ''} className={`${input} font-mono`} disabled={!admin} />
              </div>
              <div>
                <label className={label} htmlFor="fiscalYear">Tahun Anggaran</label>
                <input id="fiscalYear" name="fiscalYear" type="number" defaultValue={school?.fiscalYear ?? new Date().getFullYear()} className={`${input} font-mono`} disabled={!admin} />
              </div>
            </div>
          </SaveForm>
        </div>

        <div className={`${card} h-fit p-6`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-gray-900">Kegiatan Aktif</h2>
            {activity && <Badge status={activity.status} />}
          </div>
          {activity ? (
            <>
              <Info k="Nama" v={activity.name} />
              <Info k="Periode" v={`${fdateLong(isoDate(activity.startDate))} – ${fdateLong(isoDate(activity.endDate))}`} />
              <Info k="Lokasi" v={activity.location} />
              <Info k="Kontribusi per siswa" v={<span className="font-mono">{rp(activity.contribution)}</span>} />
              <Info k="Target peserta" v={activity.participantTarget || '—'} />
              <Info k="Prefix kuitansi" v={<span className="font-mono">{activity.receiptPrefix}</span>} />
              <Info k="Kuitansi berikutnya" v={<span className="font-mono">{activity.receiptPrefix}/{padSeq((lastPayment?._max.seq ?? 0) + 1, 4)}</span>} />
              <Info k="Bukti keluar berikutnya" v={<span className="font-mono">BKK/{activity.receiptPrefix}/{padSeq((lastExpense?._max.seq ?? 0) + 1, 3)}</span>} />
              <p className="mt-4 text-[12.5px] text-gray-500">
                Ubah kontribusi, prefix kuitansi, dan data lain di{' '}
                <Link href="/master/kegiatan" className="font-semibold text-brand-700">Master Data › Kegiatan</Link>. Nomor yang sudah terpakai tidak pernah dipakai ulang.
              </p>
            </>
          ) : (
            <p className="text-[13px] text-gray-500">Belum ada kegiatan aktif.</p>
          )}
        </div>
      </div>
    </>
  );
}
