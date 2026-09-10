import { PageHead } from '@/components/shell/PageHead';
import { ChangePasswordForm } from './form';

export default function GantiSandiPage() {
  return (
    <>
      <PageHead pathname="/ganti-sandi" />
      <div className="max-w-[560px] rounded-xl border border-gray-200 bg-white p-8">
        <h2 className="mb-1 text-[15px] font-bold text-gray-900">Ganti Sandi Wajib</h2>
        <p className="mb-6 text-[13px] text-gray-500">
          Demi keamanan akun Anda, sandi awal harus diganti sebelum melanjutkan menggunakan aplikasi.
        </p>
        <ChangePasswordForm />
      </div>
    </>
  );
}
