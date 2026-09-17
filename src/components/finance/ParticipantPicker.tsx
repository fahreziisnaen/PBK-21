'use client';

import { useState } from 'react';
import { StudentFilterFields, useStudentFilter } from '@/components/finance/StudentFilter';
import { StudentLine } from '@/components/finance/StudentPicker';
import { rp } from '@/lib/format';

export type PayableParticipant = {
  id: string;
  name: string;
  nis: string;
  grade: string;
  className: string | null;
  remaining: number;
};

/**
 * Pemilih satu peserta untuk dicatat pembayarannya.
 *
 * Menggantikan `<select>` berisi seluruh peserta: dengan ratusan siswa,
 * mencari satu nama di dropdown berarti menggulir panjang tanpa bisa mengetik
 * atau menyaring kelas. Nilai terpilih dikirim lewat input tersembunyi, jadi
 * pilihan tetap terkirim meski baris siswanya sedang tersaring keluar — dan
 * ringkasan di bawah daftar selalu menunjukkan siapa yang sedang dipilih.
 */
export function ParticipantPicker({ participants }: { participants: PayableParticipant[] }) {
  const filter = useStudentFilter(participants);
  const { visible } = filter;
  const [selected, setSelected] = useState('');
  const chosen = participants.find((p) => p.id === selected);

  return (
    <div className="space-y-2">
      <input type="hidden" name="participantId" value={selected} />
      <StudentFilterFields filter={filter} />

      <div
        role="radiogroup"
        aria-label="Siswa"
        className="max-h-[240px] overflow-y-auto rounded-lg border border-gray-200 max-[520px]:max-h-[38vh]"
      >
        {visible.length === 0 && (
          <p className="px-3 py-6 text-center text-[12.5px] text-gray-500">Tidak ada siswa yang cocok.</p>
        )}
        {visible.map((p) => (
          <label
            key={p.id}
            className={
              'flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 text-[13px] last:border-0 ' +
              (p.id === selected ? 'bg-brand-50' : 'hover:bg-gray-50')
            }
          >
            <input
              type="radio"
              name="participantChoice"
              value={p.id}
              checked={p.id === selected}
              onChange={() => setSelected(p.id)}
              className="h-4 w-4 flex-none"
            />
            <StudentLine
              student={p}
              aside={
                <>
                  <span className="block text-[11px] text-gray-500">sisa</span>
                  <span className="font-mono font-semibold">{rp(p.remaining)}</span>
                </>
              }
            />
          </label>
        ))}
      </div>

      <p className="text-[12.5px] text-ink-soft" aria-live="polite">
        {chosen ? (
          <>
            Dipilih: <b className="text-gray-900">{chosen.name}</b> · sisa tagihan{' '}
            <span className="font-mono font-semibold text-gray-900">{rp(chosen.remaining)}</span>
          </>
        ) : (
          `Belum ada siswa dipilih · ${visible.length} dari ${participants.length} peserta belum lunas tampil`
        )}
      </p>
    </div>
  );
}
