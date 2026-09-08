import { describe, expect, it } from 'vitest';
import { fdate, fdateLong, padSeq, rp, rpShort, terbilang } from '@/lib/format';

describe('rp', () => {
  it('memformat rupiah gaya Indonesia', () => {
    expect(rp(250000)).toBe('Rp250.000');
    expect(rp(7000000)).toBe('Rp7.000.000');
    expect(rp(0)).toBe('Rp0');
  });
});

describe('rpShort', () => {
  it('memakai satu desimal koma di bawah 10 juta', () => {
    expect(rpShort(7000000)).toBe('Rp7,0 jt');
  });
  it('membulatkan ke bilangan bulat mulai 10 juta', () => {
    expect(rpShort(18000000)).toBe('Rp18 jt');
  });
  it('memakai satuan ribu', () => {
    expect(rpShort(250000)).toBe('Rp250 rb');
  });
  it('menampilkan apa adanya di bawah seribu', () => {
    expect(rpShort(500)).toBe('Rp500');
  });
});

describe('fdate', () => {
  it('memformat tanggal pendek', () => {
    expect(fdate('2026-09-19')).toBe('19 Sep 2026');
    expect(fdate('2026-05-16')).toBe('16 Mei 2026');
  });
  it('mengembalikan strip untuk nilai kosong', () => {
    expect(fdate('')).toBe('-');
  });
});

describe('fdateLong', () => {
  it('memformat tanggal panjang', () => {
    expect(fdateLong('2026-09-19')).toBe('19 September 2026');
  });
});

describe('terbilang', () => {
  it('mengeja nominal kuitansi', () => {
    expect(terbilang(250000)).toBe('Dua ratus lima puluh ribu rupiah');
    expect(terbilang(100000)).toBe('Seratus ribu rupiah');
    expect(terbilang(1500)).toBe('Seribu lima ratus rupiah');
    expect(terbilang(11000)).toBe('Sebelas ribu rupiah');
    expect(terbilang(7000000)).toBe('Tujuh juta rupiah');
    expect(terbilang(1250000)).toBe('Satu juta dua ratus lima puluh ribu rupiah');
  });
  it('menangani nol', () => {
    expect(terbilang(0)).toBe('Nol rupiah');
  });
});

describe('padSeq', () => {
  it('memberi nol di depan', () => {
    expect(padSeq(88, 4)).toBe('0088');
    expect(padSeq(7, 3)).toBe('007');
  });
});
