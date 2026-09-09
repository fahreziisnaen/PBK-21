import { PageHead } from '@/components/shell/PageHead';

export default function Page() {
  return (
    <>
      <PageHead pathname="/states" />
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-[13px] text-gray-500">
        Halaman ini dibangun pada plan berikutnya.
      </div>
    </>
  );
}
