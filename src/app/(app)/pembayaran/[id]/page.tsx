import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/shell/PageHead';
import { Badge } from '@/components/ui/Badge';
import { CancelPaymentButton } from '@/components/finance/CancelPaymentButton';
import { requireUser } from '@/lib/auth-guard';
import { canWrite } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { isoDate } from '@/lib/finance';
import { fdateLong, rp, terbilang } from '@/lib/format';
import { btnDanger, btnPrimary, btnSecondary, card } from '@/lib/ui';

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2.5 text-[13px] last:border-0">
      <span className="text-gray-500">{k}</span>
      <span className="text-right font-semibold text-gray-900">{v}</span>
    </div>
  );
}

export default async function DetailPembayaranPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { activity: true, participant: { include: { student: true } }, proof: true },
  });
  if (!payment) notFound();

  const [creator, canceller] = await Promise.all([
    prisma.user.findUnique({ where: { id: payment.createdById }, select: { name: true } }),
    payment.cancelledById ? prisma.user.findUnique({ where: { id: payment.cancelledById }, select: { name: true } }) : null,
  ]);
  const student = payment.participant.student;
  const cancellable = canWrite(user.role) && payment.status === 'SAH' && payment.activity.status !== 'ARSIP';

  return (
    <>
      <PageHead
        pathname="/pembayaran/[id]"
        actions={
          <>
            <Link href="/pembayaran" className={btnSecondary}>Kembali</Link>
            <Link href={`/kuitansi?id=${payment.id}`} className={btnPrimary}>Cetak Kuitansi</Link>
            {cancellable && <CancelPaymentButton id={payment.id} receiptNo={payment.receiptNo} className={btnDanger} />}
          </>
        }
      />
      <div className="grid grid-cols-[1.4fr_1fr] gap-4 max-[900px]:grid-cols-1">
        <div className={`${card} p-6`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-[12px] font-semibold text-gray-500">No. Kuitansi</div>
              <div className="font-mono text-[20px] font-bold text-gray-900">{payment.receiptNo}</div>
            </div>
            <Badge status={payment.status} />
          </div>
          <div className={`font-mono text-[28px] font-bold ${payment.status === 'SAH' ? 'text-success-700' : 'text-gray-400 line-through'}`}>
            {rp(payment.amount)}
          </div>
          <div className="mt-1 text-[13px] italic text-gray-600">{terbilang(payment.amount)}</div>
          <div className="mt-5">
            <Row k="Tanggal" v={fdateLong(isoDate(payment.date))} />
            <Row k="Metode" v={payment.method === 'TUNAI' ? 'Tunai' : 'Transfer'} />
            <Row k="Kegiatan" v={payment.activity.name} />
            <Row k="Catatan" v={payment.note ?? '—'} />
            <Row k="Kelas siswa" v={student.className ?? student.grade} />
            <Row k="Dicatat oleh" v={creator?.name ?? '—'} />
            {payment.status === 'DIBATALKAN' && (
              <>
                <Row k="Dibatalkan oleh" v={canceller?.name ?? '—'} />
                <Row k="Waktu pembatalan" v={payment.cancelledAt ? payment.cancelledAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '—'} />
              </>
            )}
          </div>
        </div>
        <div className="space-y-4">
        <div className={`${card} h-fit p-6`}>
          <div className="text-[12px] font-semibold text-gray-500">Siswa</div>
          <Link href={`/siswa/${student.id}`} className="text-[16px] font-bold text-gray-900 hover:text-brand-600">{student.name}</Link>
          <div className="mt-3">
            <Row k="NIS" v={<span className="font-mono">{student.nis}</span>} />
            <Row k="Kelas" v={student.className ?? student.grade} />
            <Row k="Tagihan kegiatan" v={<span className="font-mono">{rp(payment.participant.billing)}</span>} />
          </div>
        </div>
        {payment.proof && (
          <div className={`${card} p-6`}>
            <div className="mb-2 text-[12px] font-semibold text-gray-500">Bukti Transfer</div>
            {/* Data URI dari database — bukan berkas eksternal, jadi tidak lewat optimizer gambar. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={payment.proof.data} alt={`Bukti transfer ${payment.receiptNo}`} className="w-full rounded-lg border border-gray-200" />
            <a href={payment.proof.data} download={`bukti-${payment.receiptNo.replace(/\//g, '-')}.jpg`} className="mt-2 inline-block text-[12.5px] font-semibold text-brand-600">
              Unduh bukti
            </a>
          </div>
        )}
        </div>
      </div>
    </>
  );
}
