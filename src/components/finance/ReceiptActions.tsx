'use client';

import { useState } from 'react';
import { btnSecondary } from '@/lib/ui';

/**
 * Mengunduh kuitansi sebagai gambar JPG — mudah dikirim lewat WhatsApp ke
 * orang tua, tanpa perlu mencetak atau membuat PDF. Pustakanya dimuat hanya
 * saat tombol ditekan, supaya tidak menambah beban halaman.
 */
export function ReceiptActions({ targetId, filename }: { targetId: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const node = document.getElementById(targetId);
      if (!node) throw new Error('Kuitansi tidak ditemukan di halaman.');
      const { toJpeg } = await import('html-to-image');
      // Lebar dan tinggi dikunci ke ukuran elemennya, dan marginnya dinolkan
      // pada salinan yang digambar. Kuitansi dipusatkan dengan `mx-auto`, yang
      // jadi margin kiri nyata (mis. 195px); html-to-image ikut menyalin
      // margin itu lalu menggambarnya di kanvas selebar elemennya saja,
      // sehingga hasilnya tergeser ke kanan dan sisi kanannya terpotong.
      const dataUrl = await toJpeg(node, {
        quality: 0.95,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        width: node.offsetWidth,
        height: node.offsetHeight,
        style: { margin: '0', transform: 'none', transformOrigin: 'top left' },
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      link.click();
    } catch {
      setError('Gagal membuat gambar. Coba tombol Cetak, lalu simpan sebagai PDF.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span data-noprint className="inline-flex flex-col items-end">
      <button type="button" className={btnSecondary} onClick={download} disabled={busy}>
        {busy ? 'Menyiapkan…' : 'Unduh JPG'}
      </button>
      {error && <span className="mt-1 max-w-[220px] text-right text-[11.5px] text-error-600">{error}</span>}
    </span>
  );
}
