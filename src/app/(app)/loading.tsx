/**
 * Ditampilkan Next.js selama data halaman berikutnya disiapkan di server.
 * Bentuknya mengikuti tata letak halaman yang paling umum — judul, empat
 * kartu ringkasan, lalu tabel — supaya pergantian halaman tidak terasa
 * seperti aplikasi berhenti.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat halaman…</span>

      <div className="mb-6">
        <div className="pbk-skeleton h-3 w-32" />
        <div className="pbk-skeleton mt-2 h-6 w-56" />
        <div className="pbk-skeleton mt-2 h-5 w-64 rounded-full" />
      </div>

      <div className="mb-4 grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[520px]:gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 max-[520px]:p-3">
            <div className="pbk-skeleton h-3 w-20" />
            <div className="pbk-skeleton mt-2.5 h-5 w-28" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
          <div className="pbk-skeleton h-3 w-40" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-gray-100 px-4 py-3.5 last:border-0">
            <div className="pbk-skeleton h-3.5 w-24 flex-none" />
            <div className="pbk-skeleton h-3.5 flex-1" />
            <div className="pbk-skeleton h-3.5 w-20 flex-none max-[520px]:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}
