import { describe, expect, it } from 'vitest';
import { resolveActiveActivity } from '@/lib/activity-context';

const acts = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];

describe('resolveActiveActivity', () => {
  it('memakai id dari cookie bila valid', () => {
    expect(resolveActiveActivity('a2', acts)).toBe('a2');
  });

  it('jatuh ke kegiatan pertama bila cookie kosong', () => {
    expect(resolveActiveActivity(undefined, acts)).toBe('a1');
  });

  it('jatuh ke kegiatan pertama bila cookie menunjuk id yang tidak ada', () => {
    expect(resolveActiveActivity('sudah-dihapus', acts)).toBe('a1');
  });

  it('mengembalikan null bila tidak ada kegiatan sama sekali', () => {
    expect(resolveActiveActivity('a1', [])).toBeNull();
  });
});
