import { ConfirmAction } from '@/components/ui/ConfirmAction';
import { cancelPayment } from '@/lib/actions/payments';

/** Salinan teks konfirmasi verbatim dari prototipe (spec §4.4). */
export function CancelPaymentButton({ id, receiptNo, className }: { id: string; receiptNo: string; className?: string }) {
  return (
    <ConfirmAction
      label="Batalkan"
      className={className}
      title="Batalkan Pembayaran"
      body={`Pembayaran ${receiptNo} akan dibatalkan.`}
      bullets={[
        'Transaksi tetap tersimpan dalam riwayat dan jejak audit — tidak ada catatan keuangan yang dihapus.',
        'Nominal tidak lagi dihitung dalam total pemasukan, saldo kas, maupun status pelunasan siswa.',
        'Kuitansi yang sudah dicetak menjadi tidak berlaku dan ditandai "Dibatalkan".',
      ]}
      confirmLabel="Batalkan Pembayaran"
      run={cancelPayment.bind(null, id)}
    />
  );
}
