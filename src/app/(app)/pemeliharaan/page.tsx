import { PageHead } from '@/components/shell/PageHead';
import { SaveForm } from '@/components/ui/SaveForm';
import { requireUser } from '@/lib/auth-guard';
import { currentMigration, dataCounts } from '@/lib/maintenance';
import { restoreFromUpload, runFactoryReset } from '@/lib/actions/maintenance';
import { btnPrimary, card, input, label } from '@/lib/ui';

export default async function PemeliharaanPage() {
  const user = await requireUser();
  if (user.role !== 'SUPERADMIN') {
    return (
      <>
        <PageHead pathname="/pemeliharaan" />
        <div className={`${card} p-10 text-center text-[13px] text-gray-600`}>Halaman ini hanya untuk Superadmin.</div>
      </>
    );
  }

  const [counts, migration] = await Promise.all([dataCounts(), currentMigration()]);
  const toReset = counts.filter((c) => c.reset);
  const kept = counts.filter((c) => !c.reset);

  return (
    <>
      <PageHead pathname="/pemeliharaan" />

      <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-1">
        {/* Backup */}
        <div className={`${card} flex flex-col p-6`}>
          <h2 className="text-[15px] font-bold text-gray-900">Backup</h2>
          <p className="mt-1 text-[12.5px] text-gray-500">Unduh seluruh data aplikasi sebagai satu file. Simpan di tempat aman.</p>
          <ul className="my-4 space-y-1 text-[12.5px]">
            {counts.map((c) => (
              <li key={c.name} className="flex justify-between">
                <span className="text-gray-600">{c.label}</span>
                <span className="font-mono text-gray-900">{c.count}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto space-y-3">
            {/* Tautan biasa, bukan <Link>: responsnya file unduhan, bukan halaman. */}
            <a href="/api/backup" className={`${btnPrimary} w-full`}>Unduh Backup</a>
            <p className="text-[11.5px] text-gray-500">
              File berisi data pribadi siswa dan akun pengguna. Verifikasi dua langkah pengguna hanya bisa dipakai
              di server dengan <b>ENCRYPTION_KEY</b> yang sama.
            </p>
          </div>
        </div>

        {/* Restore */}
        <div className={`${card} p-6`}>
          <h2 className="text-[15px] font-bold text-gray-900">Restore</h2>
          <p className="mt-1 text-[12.5px] text-gray-500">Pulihkan data dari file backup.</p>
          <div className="my-4 rounded-lg bg-warn-50 px-3 py-2 text-[12.5px] text-warn-700">
            <b>Semua data saat ini akan diganti</b> dengan isi backup, termasuk daftar pengguna. Unduh backup data sekarang dulu bila masih diperlukan.
          </div>
          <SaveForm action={restoreFromUpload} submitLabel="Pulihkan Data">
            <div>
              <label className={label} htmlFor="file">File backup (.json)</label>
              <input id="file" name="file" type="file" accept="application/json,.json" required className="block w-full text-[13px] text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:font-semibold" />
            </div>
            <div>
              <label className={label} htmlFor="confirm-restore">Ketik <b>PULIHKAN</b> untuk mengonfirmasi</label>
              <input id="confirm-restore" name="confirm" autoComplete="off" required className={`${input} font-mono`} />
            </div>
            <p className="text-[11.5px] text-gray-500">Hanya backup dari versi aplikasi yang sama (<span className="font-mono">{migration}</span>) yang bisa dipulihkan.</p>
          </SaveForm>
        </div>

        {/* Factory reset */}
        <div className={`${card} border-error-200 p-6`}>
          <h2 className="text-[15px] font-bold text-error-600">Factory Reset</h2>
          <p className="mt-1 text-[12.5px] text-gray-500">Kosongkan aplikasi untuk mulai dari awal — mis. membersihkan data contoh.</p>
          <div className="my-4 grid grid-cols-2 gap-3 text-[12px]">
            <div>
              <div className="mb-1 font-semibold text-error-600">Dihapus permanen</div>
              <ul className="space-y-0.5 text-gray-700">
                {toReset.map((c) => (
                  <li key={c.name}>{c.label} <span className="font-mono text-gray-400">({c.count})</span></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 font-semibold text-success-700">Tetap disimpan</div>
              <ul className="space-y-0.5 text-gray-700">
                {kept.map((c) => (
                  <li key={c.name}>{c.label}</li>
                ))}
                <li>Log keamanan</li>
              </ul>
            </div>
          </div>
          <SaveForm action={runFactoryReset} submitLabel="Jalankan Factory Reset">
            <div>
              <label className={label} htmlFor="confirm-reset">Ketik <b>RESET</b> untuk mengonfirmasi</label>
              <input id="confirm-reset" name="confirm" autoComplete="off" required className={`${input} font-mono`} />
            </div>
            <p className="text-[11.5px] text-gray-500">Tidak bisa dibatalkan. Unduh backup lebih dulu.</p>
          </SaveForm>
        </div>
      </div>
    </>
  );
}
