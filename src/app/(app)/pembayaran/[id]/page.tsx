import { PageHead } from '@/components/shell/PageHead';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PageHead pathname={`/pembayaran/${id}`} />
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-[13px] text-gray-500">
        Halaman ini dibangun pada plan berikutnya.
      </div>
    </>
  );
}
