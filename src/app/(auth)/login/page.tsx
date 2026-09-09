import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex flex-col justify-between gap-10 px-8 py-10 lg:px-14 lg:py-13">
        <div className="flex items-center gap-3">
          <div className="grid h-[38px] w-[38px] place-items-center rounded-[9px] bg-brand-600 text-sm font-extrabold text-white">
            PBK
          </div>
          <div>
            <div className="text-sm font-bold tracking-[-0.2px]">Pencatatan Buku Kas</div>
            <div className="text-[11.5px] text-gray-500">Sistem Administrasi Keuangan Sekolah</div>
          </div>
        </div>

        <LoginForm />

        <div className="text-[11.5px] text-gray-500">SMAN 21 Surabaya · Tahun anggaran 2026</div>
      </div>

      <div className="hidden bg-sidebar lg:block" aria-hidden />
    </div>
  );
}
