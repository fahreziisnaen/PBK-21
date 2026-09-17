import { describe, expect, it } from 'vitest';
import { reportPeriod } from '@/lib/report-period';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const base = { from: null, to: null, firstDate: null, lastDate: null, today: '2026-09-17' };

describe('reportPeriod', () => {
  it('tanpa penyaring, dimulai dari transaksi pertama — bukan tanggal mulai kegiatan', () => {
    // Iuran dipungut sejak Agustus untuk kegiatan yang berangkat September.
    expect(reportPeriod({ ...base, firstDate: d('2026-08-01'), lastDate: d('2026-08-25') })).toBe(
      '01 Agustus 2026 s.d. 17 September 2026',
    );
  });

  it('akhir periode ditulis sebagai tanggal cetak, bukan "saat ini"', () => {
    expect(reportPeriod({ ...base, firstDate: d('2026-08-01'), lastDate: d('2026-08-25') })).not.toContain('saat ini');
  });

  it('transaksi bertanggal sesudah hari cetak tetap tercakup', () => {
    expect(reportPeriod({ ...base, firstDate: d('2026-08-01'), lastDate: d('2026-10-02') })).toBe(
      '01 Agustus 2026 s.d. 02 Oktober 2026',
    );
  });

  it('penyaring tanggal menang atas tanggal transaksi', () => {
    expect(
      reportPeriod({ ...base, from: d('2026-08-10'), to: d('2026-08-20'), firstDate: d('2026-08-01'), lastDate: d('2026-10-02') }),
    ).toBe('10 Agustus 2026 s.d. 20 Agustus 2026');
  });

  it('hanya tanggal awal: berakhir di tanggal cetak', () => {
    expect(reportPeriod({ ...base, from: d('2026-08-10'), firstDate: d('2026-08-12'), lastDate: d('2026-08-30') })).toBe(
      '10 Agustus 2026 s.d. 17 September 2026',
    );
  });

  it('belum ada transaksi dan tanpa penyaring', () => {
    expect(reportPeriod(base)).toBe('Sampai 17 September 2026 — belum ada transaksi');
  });
});
