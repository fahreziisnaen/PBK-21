import Link from 'next/link';
import { PageHead } from '@/components/shell/PageHead';
import { requireUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { rp } from '@/lib/format';
import { card } from '@/lib/ui';

type Event = { key: string; at: Date; kind: 'ok' | 'warn' | 'info'; title: string; body: string; href?: string };

const AUDIT_TITLES: Record<string, string> = {
  'payment.cancel': 'Pembayaran dibatalkan',
  'expense.cancel': 'Pengeluaran dibatalkan',
  'expense.update': 'Pengeluaran diubah',
  'activity.archive': 'Kegiatan diarsipkan',
  'category.deactivate': 'Kategori dinonaktifkan',
  'category.activate': 'Kategori diaktifkan',
  'user.create': 'Pengguna baru dibuat',
  'user.role_change': 'Peran pengguna diubah',
  'user.password_reset': 'Sandi pengguna direset',
  'user.activate': 'Pengguna diaktifkan',
  'user.deactivate': 'Pengguna dinonaktifkan',
  'user.totp_reset': '2FA pengguna direset',
};

/**
 * Umpan peristiwa keuangan dan kegiatan, disusun dari transaksi dan jejak
 * audit yang sudah tercatat — tidak ada tabel terpisah yang bisa tertinggal.
 */
export default async function NotifikasiPage() {
  await requireUser();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [payments, expenses, audits] = await Promise.all([
    prisma.payment.findMany({
      where: { createdAt: { gte: since } },
      include: { activity: true, participant: { include: { student: true } } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
    prisma.expense.findMany({ where: { createdAt: { gte: since } }, include: { activity: true }, orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.auditLog.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 60 }),
  ]);
  const actors = await prisma.user.findMany({ where: { id: { in: [...new Set(audits.map((a) => a.userId))] } }, select: { id: true, name: true } });
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  const events: Event[] = [
    ...payments.map((p) => ({
      key: `p${p.id}`,
      at: p.createdAt,
      kind: 'ok' as const,
      title: `Pembayaran ${rp(p.amount)} diterima`,
      body: `${p.participant.student.name} · ${p.receiptNo} · ${p.activity.name}`,
      href: `/pembayaran/${p.id}`,
    })),
    ...expenses.map((e) => ({
      key: `e${e.id}`,
      at: e.createdAt,
      kind: 'info' as const,
      title: `Pengeluaran ${rp(e.amount)} dicatat`,
      body: `${e.description} · ${e.refNo} · ${e.activity.name}`,
    })),
    ...audits.map((a) => {
      const meta = (a.meta ?? {}) as Record<string, unknown>;
      const ref = meta.receiptNo ?? meta.refNo ?? meta.username ?? '';
      return {
        key: `a${a.id}`,
        at: a.createdAt,
        kind: 'warn' as const,
        title: AUDIT_TITLES[a.action] ?? a.action,
        body: `${ref ? `${String(ref)} · ` : ''}oleh ${actorName.get(a.userId) ?? 'pengguna'}`,
        href: a.entity === 'Payment' ? `/pembayaran/${a.entityId}` : undefined,
      };
    }),
  ].sort((x, y) => y.at.getTime() - x.at.getTime());

  const dot = { ok: 'bg-success-500', warn: 'bg-warn-500', info: 'bg-brand-600' };

  return (
    <>
      <PageHead pathname="/notifikasi" />
      <div className={`${card} p-2`}>
        {events.length === 0 && <p className="p-8 text-center text-[13px] text-gray-500">Belum ada peristiwa dalam 30 hari terakhir.</p>}
        <ul className="divide-y divide-gray-100">
          {events.map((e) => {
            const content = (
              <div className="flex gap-3 px-4 py-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot[e.kind]}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-gray-900">{e.title}</div>
                  <div className="truncate text-[12.5px] text-gray-500">{e.body}</div>
                </div>
                <div className="whitespace-nowrap text-[11.5px] text-gray-400">
                  {e.at.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
            );
            return <li key={e.key}>{e.href ? <Link href={e.href} className="block hover:bg-gray-50">{content}</Link> : content}</li>;
          })}
        </ul>
      </div>
    </>
  );
}
