export function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'success' | 'error' | 'brand' }) {
  const color =
    tone === 'success' ? 'text-success-700' : tone === 'error' ? 'text-error-600' : tone === 'brand' ? 'text-brand-600' : 'text-gray-900';
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 max-[520px]:p-3">
      <div className="truncate text-[12px] font-semibold text-gray-500">{label}</div>
      <div className={`mt-1 truncate font-mono text-[20px] font-bold max-[520px]:text-[15px] ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11.5px] text-gray-500">{hint}</div>}
    </div>
  );
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[520px]:gap-2">{children}</div>;
}

export function NoActivity() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
      <div className="text-[15px] font-bold text-gray-900">Belum ada kegiatan aktif</div>
      <p className="mt-1 text-[13px] text-gray-500">
        Buat kegiatan di <a href="/master/kegiatan" className="font-semibold text-brand-600">Master Data › Kegiatan</a>, lalu pilih di bagian atas halaman.
      </p>
    </div>
  );
}
