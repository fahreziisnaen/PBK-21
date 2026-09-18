import Link from 'next/link';
import { BrandMark } from '@/components/shell/BrandMark';
import { PageHead } from '@/components/shell/PageHead';
import { NoActivity } from '@/components/ui/Kpi';
import { PrintButton } from '@/components/ui/PrintButton';
import { ReceiptActions } from '@/components/finance/ReceiptActions';
import { requireUser } from '@/lib/auth-guard';
import { getActiveActivity } from '@/lib/activity-context';
import { prisma } from '@/lib/prisma';
import { isoDate } from '@/lib/finance';
import { fdate, fdateLong, rp, terbilang } from '@/lib/format';
import { btnGhost, btnSecondary, mono, table, tableWrap, td, tdNum, th, thNum } from '@/lib/ui';

export default async function KuitansiPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireUser();
  const { id } = await searchParams;

  if (id) {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { activity: true, participant: { include: { student: true } } },
    });
    if (payment) {
      const [school, creator] = await Promise.all([
        prisma.school.findFirst(),
        prisma.user.findUnique({ where: { id: payment.createdById }, select: { name: true, signatureImage: true } }),
      ]);
      const s = payment.participant.student;
      const cancelled = payment.status === 'DIBATALKAN';
      return (
        <>
          <PageHead
            pathname="/kuitansi"
            actions={
              <>
                <Link href={`/pembayaran/${payment.id}`} className={btnSecondary}>Kembali</Link>
                <ReceiptActions targetId="kuitansi" filename={`kuitansi-${payment.receiptNo.replace(/\//g, '-')}.jpg`} />
                <PrintButton label="Cetak Kuitansi" />
              </>
            }
          />
          <div id="kuitansi" className="relative mx-auto max-w-[760px] overflow-hidden rounded-xl border border-gray-300 bg-white p-8 max-[520px]:p-5 print:rounded-none print:border-gray-400">
            {cancelled && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="-rotate-12 rounded-lg border-4 border-error-600 px-6 py-2 text-[44px] font-extrabold tracking-widest text-error-600 opacity-40">
                  DIBATALKAN
                </span>
              </div>
            )}
            <div className="flex items-center gap-4 border-b-2 border-gray-900 pb-4">
              <BrandMark size={56} />
              <div>
                <div className="text-[17px] font-extrabold uppercase tracking-wide text-gray-900">{school?.name ?? 'Sekolah'}</div>
                {school?.address && <div className="text-[12px] text-gray-600">{school.address}</div>}
                {school?.npsn && <div className="text-[12px] text-gray-600">NPSN {school.npsn}</div>}
              </div>
            </div>

            <div className="mt-5 flex items-end justify-between">
              <h2 className="text-[22px] font-extrabold tracking-[3px] text-gray-900">KUITANSI</h2>
              <div className="text-right text-[12.5px] text-gray-600">
                No. <span className="font-mono text-[14px] font-bold text-gray-900">{payment.receiptNo}</span>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-[13.5px]">
              <div className="grid grid-cols-[170px_1fr] gap-2 max-[520px]:grid-cols-1 max-[520px]:gap-0.5">
                <span className="text-gray-600">Telah terima dari</span>
                <span className="border-b border-dotted border-gray-400 font-semibold text-gray-900">
                  {s.name} ({s.className ?? `Kelas ${s.grade}`}, NIS {s.nis})
                </span>
              </div>
              <div className="grid grid-cols-[170px_1fr] gap-2 max-[520px]:grid-cols-1 max-[520px]:gap-0.5">
                <span className="text-gray-600">Uang sejumlah</span>
                <span className="border-b border-dotted border-gray-400 font-semibold italic text-gray-900">{terbilang(payment.amount)}</span>
              </div>
              <div className="grid grid-cols-[170px_1fr] gap-2 max-[520px]:grid-cols-1 max-[520px]:gap-0.5">
                <span className="text-gray-600">Untuk pembayaran</span>
                <span className="border-b border-dotted border-gray-400 text-gray-900">
                  Kontribusi {payment.activity.name} ({payment.method === 'TUNAI' ? 'tunai' : 'transfer'})
                  {payment.note ? ` — ${payment.note}` : ''}
                </span>
              </div>
            </div>

            {/* Di layar sempit nominal dan blok tanda tangan ditumpuk: berdampingan
                keduanya melebihi lebar kartu, dan `overflow-hidden` di atas akan
                memangkas tanggal serta nama bendahara tanpa terlihat. */}
            <div className="mt-8 flex items-end justify-between gap-6 max-[520px]:flex-col max-[520px]:items-stretch max-[520px]:gap-5">
              <div className="rounded-lg border-2 border-gray-900 px-5 py-3 text-center font-mono text-[22px] font-bold text-gray-900 max-[520px]:text-[19px]">
                {rp(payment.amount)}
              </div>
              <div className="min-w-[220px] text-center text-[13px] text-gray-700 max-[520px]:min-w-0">
                <div>Surabaya, {fdateLong(isoDate(payment.date))}</div>
                <div>Bendahara</div>
                {creator?.signatureImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={creator.signatureImage} alt="Tanda tangan bendahara" className="mx-auto h-16 object-contain" />
                ) : (
                  <div className="h-16" />
                )}
                <div className="border-t border-gray-500 pt-1 font-semibold text-gray-900">{creator?.name ?? '....................'}</div>
              </div>
            </div>
          </div>
        </>
      );
    }
  }

  const activity = await getActiveActivity();
  if (!activity) {
    return (
      <>
        <PageHead pathname="/kuitansi" />
        <NoActivity />
      </>
    );
  }
  const recent = await prisma.payment.findMany({
    where: { activityId: activity.id },
    include: { participant: { include: { student: true } } },
    orderBy: [{ date: 'desc' }, { seq: 'desc' }],
    take: 50,
  });

  return (
    <>
      <PageHead pathname="/kuitansi" activity={activity} />
      <p className="mb-3 text-[13px] text-gray-600">Pilih pembayaran untuk menampilkan kuitansi siap cetak.</p>
      <div className={tableWrap}>
        <table data-stack className={table}>
          <thead>
            <tr>
              <th className={th}>No. Kuitansi</th>
              <th className={th}>Tanggal</th>
              <th className={th}>Siswa</th>
              <th className={thNum}>Jumlah</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr>
                <td className={`${td} py-10 text-center text-gray-500`} colSpan={5}>Belum ada pembayaran di kegiatan ini.</td>
              </tr>
            )}
            {recent.map((p) => (
              <tr key={p.id} className={p.status === 'DIBATALKAN' ? 'opacity-60' : ''}>
                <td data-label="No. Kuitansi" className={`${td} ${mono} font-semibold`}>{p.receiptNo}</td>
                <td data-label="Tanggal" className={td}>{fdate(isoDate(p.date))}</td>
                <td data-label="Siswa" className={td}>{p.participant.student.name}</td>
                <td data-label="Jumlah" className={tdNum}>{rp(p.amount)}</td>
                <td data-label="" className={td}><Link href={`/kuitansi?id=${p.id}`} className={btnGhost}>Tampilkan</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
