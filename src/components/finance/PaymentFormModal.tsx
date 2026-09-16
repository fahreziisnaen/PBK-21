import { FormModal } from '@/components/ui/FormModal';
import { recordPayment } from '@/lib/actions/payments';
import { rp } from '@/lib/format';
import { btnPrimary, input, label, textarea } from '@/lib/ui';

type Option = { id: string; name: string; nis: string; remaining: number };

export function PaymentFormModal({
  participants,
  defaultParticipantId,
  today,
  trigger = '+ Catat Pembayaran',
  triggerClassName = btnPrimary,
}: {
  participants: Option[];
  defaultParticipantId?: string;
  today: string;
  trigger?: string;
  triggerClassName?: string;
}) {
  const payable = participants.filter((p) => p.remaining > 0);
  const single = payable.length === 1 ? payable[0] : undefined;

  return (
    <FormModal trigger={trigger} triggerClassName={triggerClassName} title="Catat Pembayaran" action={recordPayment}>
      <div>
        <label className={label} htmlFor="participantId">Siswa</label>
        {payable.length === 0 ? (
          <p className="text-[13px] text-gray-500">Semua peserta sudah lunas.</p>
        ) : (
          <select id="participantId" name="participantId" required defaultValue={defaultParticipantId ?? ''} className={input}>
            {!defaultParticipantId && <option value="" disabled>Pilih siswa…</option>}
            {payable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.nis} · sisa {rp(p.remaining)}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
        <div>
          <label className={label} htmlFor="amount">Nominal (Rp)</label>
          <input id="amount" name="amount" inputMode="numeric" required defaultValue={single?.remaining} className={`${input} font-mono`} placeholder="250000" />
        </div>
        <div>
          <label className={label} htmlFor="date">Tanggal</label>
          <input id="date" name="date" type="date" required defaultValue={today} className={input} />
        </div>
      </div>
      <div>
        <span className={label}>Metode</span>
        <div className="flex gap-4 text-[13.5px] text-gray-700">
          <label className="flex items-center gap-2"><input type="radio" name="method" value="TUNAI" defaultChecked /> Tunai</label>
          <label className="flex items-center gap-2"><input type="radio" name="method" value="TRANSFER" /> Transfer</label>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="proof">Bukti Transfer</label>
        <input
          id="proof"
          name="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="block w-full text-[13px] text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:font-semibold"
        />
        <p className="mt-1 text-[11.5px] text-gray-500">Untuk pembayaran transfer: foto atau tangkapan layar bukti, maksimal 3 MB. Kosongkan untuk pembayaran tunai.</p>
      </div>
      <div>
        <label className={label} htmlFor="note">Catatan</label>
        <textarea id="note" name="note" rows={2} className={textarea} placeholder="Opsional" />
      </div>
    </FormModal>
  );
}
