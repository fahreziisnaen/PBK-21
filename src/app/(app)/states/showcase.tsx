'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

const STATUSES = ['Lunas', 'Belum Lunas', 'Belum Bayar', 'Aktif', 'Draft', 'Dibatalkan', 'Nonaktif', 'Arsip', 'Selesai'];

export function StatesShowcase() {
  const toast = useToast();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-[14px] font-bold text-gray-900">Badge status</h2>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => <Badge key={s} status={s} />)}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-[14px] font-bold text-gray-900">Toast &amp; dialog</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toast('Pembayaran OC-X/0088 tersimpan')}
            className="rounded-lg bg-brand-500 px-4 py-2 text-[13px] font-semibold text-ink hover:bg-brand-600"
          >
            Tampilkan toast
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Tampilkan dialog konfirmasi
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={open}
        title="Batalkan Pembayaran OC-X/0088"
        body="Pembayaran Rp250.000 dari Ahmad Fauzan (X) akan dibatalkan."
        bullets={[
          'Transaksi tetap tersimpan dalam riwayat dan jejak audit — tidak ada catatan keuangan yang dihapus.',
          'Nominal tidak lagi dihitung dalam total pemasukan, saldo kas, maupun status pelunasan siswa.',
          'Kuitansi yang sudah dicetak menjadi tidak berlaku dan ditandai "Dibatalkan".',
        ]}
        confirmLabel="Ya, Batalkan Pembayaran"
        onConfirm={() => { setOpen(false); toast('Pembayaran OC-X/0088 dibatalkan', 'warn'); }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
