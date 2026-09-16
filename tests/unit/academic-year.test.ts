import { describe, expect, it } from 'vitest';
import { academicYearName, academicYearOf, nextGrade, parseAcademicYear } from '@/lib/academic-year';

describe('academicYearName', () => {
  it('menyusun nama dari tahun mulainya', () => {
    expect(academicYearName(2026)).toBe('2026/2027');
    expect(academicYearName(2099)).toBe('2099/2100');
  });
});

describe('parseAcademicYear', () => {
  it('menerima dua tahun berurutan', () => {
    expect(parseAcademicYear('2026/2027')).toBe(2026);
    expect(parseAcademicYear(' 2026 / 2027 ')).toBe(2026);
  });

  it('menolak tahun kedua yang bukan tahun berikutnya', () => {
    // Inti pemeriksaannya: "2026/2028" terlihat benar sekilas tetapi bukan
    // tahun pelajaran, dan kalau lolos akan membuat urutan tahun kacau.
    expect(parseAcademicYear('2026/2028')).toBeNull();
    expect(parseAcademicYear('2027/2026')).toBeNull();
  });

  it('menolak bentuk yang tidak dikenali', () => {
    for (const bad of ['2026', '2026-2027', 'dua ribu', '', '26/27', '2026/2027/2028']) {
      expect(parseAcademicYear(bad)).toBeNull();
    }
  });

  it('menolak tahun di luar rentang masuk akal', () => {
    expect(parseAcademicYear('1900/1901')).toBeNull();
    expect(parseAcademicYear('2200/2201')).toBeNull();
  });
});

describe('academicYearOf — tahun ajaran dimulai Juli', () => {
  it('Juli sampai Desember masuk tahun pelajaran yang dimulai tahun itu', () => {
    expect(academicYearOf(new Date('2026-07-01T00:00:00Z'))).toBe(2026);
    expect(academicYearOf(new Date('2026-12-31T00:00:00Z'))).toBe(2026);
  });

  it('Januari sampai Juni masih tahun pelajaran sebelumnya', () => {
    expect(academicYearOf(new Date('2027-01-01T00:00:00Z'))).toBe(2026);
    expect(academicYearOf(new Date('2027-06-30T00:00:00Z'))).toBe(2026);
  });
});

describe('nextGrade', () => {
  it('menaikkan satu tingkat', () => {
    expect(nextGrade('X')).toBe('XI');
    expect(nextGrade('XI')).toBe('XII');
  });

  it('kelas XII tidak punya tingkat berikutnya — itulah kelulusan', () => {
    expect(nextGrade('XII')).toBeNull();
  });
});
