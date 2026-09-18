import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/shell/PageHead';
import { Badge } from '@/components/ui/Badge';
import { requireUser } from '@/lib/auth-guard';
import { canWrite } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { isoDate, payStatus } from '@/lib/finance';
import { formatPhoneLocal } from '@/lib/phone';
import { fdate, rp } from '@/lib/format';
import { btnSecondary, card, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

export default async function DetailSiswaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      participations: {
        include: { activity: true, payments: { orderBy: [{ date: 'desc' }, { seq: 'desc' }] } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!student) notFound();

  const summaries = student.participations.map((p) => {
    const paid = p.payments.filter((x) => x.status === 'SAH').reduce((s, x) => s + x.amount, 0);
    return { ...p, paid, remaining: p.billing - paid, status: payStatus(p.billing, paid) };
  });
  const payments = summaries.flatMap((p) => p.payments.map((x) => ({ ...x, activityName: p.activity.name })));

  return (
    <>
      <PageHead
        pathname="/siswa/[id]"
        actions={
          <>
            <Link href="/siswa" className={btnSecondary}>Kembali</Link>
            {/* Halaman ini hanya membaca. Data siswanya diubah di satu tempat saja. */}
            {canWrite(user.role) && (
              <Link href={`/master/siswa?q=${encodeURIComponent(student.nis)}`} className={btnSecondary}>
                Ubah Data Siswa
              </Link>
            )}
          </>
        }
      />

      <div className={`${card} mb-4 flex flex-wrap items-center gap-x-10 gap-y-2 p-5`}>
        <div>
          <div className="text-[18px] font-bold text-gray-900">{student.name}</div>
          <div className="text-[12.5px] text-gray-500">NIS <span className={mono}>{student.nis}</span></div>
        </div>
        <div className="text-[13px]"><span className="text-gray-500">Kelas </span><b>{student.className ?? student.grade}</b></div>
        <div className="text-[13px]"><span className="text-gray-500">Telepon </span><b>{student.phone ? formatPhoneLocal(student.phone) : '—'}</b></div>
      </div>

      <h2 className="mb-2 text-[14px] font-bold text-gray-900">Tagihan per Kegiatan</h2>
      <div className={`${tableWrap} mb-6`}>
        <table data-stack className={table}>
          <thead>
            <tr>
              <th className={th}>Kegiatan</th>
              <th className={thNum}>Tagihan</th>
              <th className={thNum}>Dibayar</th>
              <th className={thNum}>Sisa</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {summaries.length === 0 && (
              <tr><td className={`${td} py-8 text-center text-gray-500`} colSpan={5}>Belum terdaftar di kegiatan mana pun.</td></tr>
            )}
            {summaries.map((p) => (
              <tr key={p.id}>
                <td data-label="Kegiatan" className={`${td} font-semibold text-gray-900`}>{p.activity.name}</td>
                <td data-label="Tagihan" className={tdNum}>{rp(p.billing)}</td>
                <td data-label="Dibayar" className={tdNum}>{rp(p.paid)}</td>
                <td data-label="Sisa" className={tdNum}>{rp(Math.max(p.remaining, 0))}</td>
                <td data-label="Status" className={td}><Badge status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-[14px] font-bold text-gray-900">Riwayat Pembayaran</h2>
      <div className={tableWrap}>
        <table data-stack className={table}>
          <thead>
            <tr>
              <th className={th}>No. Kuitansi</th>
              <th className={th}>Tanggal</th>
              <th className={th}>Kegiatan</th>
              <th className={th}>Metode</th>
              <th className={thNum}>Jumlah</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr><td className={`${td} py-8 text-center text-gray-500`} colSpan={6}>Belum ada pembayaran.</td></tr>
            )}
            {payments.map((x) => (
              <tr key={x.id} className={x.status === 'DIBATALKAN' ? 'opacity-60' : ''}>
                <td data-label="No. Kuitansi" className={`${td} ${mono} font-semibold`}>
                  <Link href={`/pembayaran/${x.id}`} className="text-brand-700 hover:underline">{x.receiptNo}</Link>
                </td>
                <td data-label="Tanggal" className={td}>{fdate(isoDate(x.date))}</td>
                <td data-label="Kegiatan" className={td}>{x.activityName}</td>
                <td data-label="Metode" className={td}>{x.method === 'TUNAI' ? 'Tunai' : 'Transfer'}</td>
                <td data-label="Jumlah" className={tdNum}>{rp(x.amount)}</td>
                <td data-label="Status" className={td}><Badge status={x.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
