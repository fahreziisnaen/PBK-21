import Link from 'next/link';
import { PageHead } from '@/components/shell/PageHead';
import { SaveForm } from '@/components/ui/SaveForm';
import { requireUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { updateOwnProfile } from '@/lib/actions/users';
import { formatPhoneLocal } from '@/lib/phone';
import { btnSecondary, card, input, label } from '@/lib/ui';

const ROLE_LABEL: Record<string, string> = { SUPERADMIN: 'Superadmin', ADMIN: 'Admin', BENDAHARA: 'Bendahara', KEPALA_SEKOLAH: 'Kepala Sekolah' };

export default async function ProfilPage() {
  const session = await requireUser();
  const me = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });

  return (
    <>
      <PageHead pathname="/profil" />
      <div className="grid grid-cols-[1.2fr_1fr] gap-4 max-[900px]:grid-cols-1">
        <div className={`${card} p-6`}>
          <div className="mb-5 flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-100 text-[18px] font-bold text-brand-700">
              {me.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div>
              <div className="text-[17px] font-bold text-gray-900">{me.name}</div>
              <div className="text-[12.5px] text-gray-500">
                <span className="font-mono">{me.username}</span> · {ROLE_LABEL[me.role]}
              </div>
            </div>
          </div>
          <SaveForm action={updateOwnProfile}>
            <div>
              <label className={label} htmlFor="name">Nama Lengkap</label>
              <input id="name" name="name" required defaultValue={me.name} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="phone">No. WhatsApp</label>
              <input id="phone" name="phone" inputMode="tel" defaultValue={me.phone ? formatPhoneLocal(me.phone) : ''} className={input} placeholder="081234567890" />
            </div>
          </SaveForm>
        </div>

        <div className={`${card} h-fit p-6`}>
          <h2 className="mb-3 text-[15px] font-bold text-gray-900">Keamanan Akun</h2>
          <div className="flex justify-between border-b border-gray-100 py-2.5 text-[13px]">
            <span className="text-gray-500">Verifikasi dua langkah</span>
            <span className="font-semibold text-gray-900">{me.totpEnabledAt ? 'Aktif' : 'Belum aktif'}</span>
          </div>
          <div className="flex justify-between py-2.5 text-[13px]">
            <span className="text-gray-500">Login terakhir</span>
            <span className="font-semibold text-gray-900">
              {me.lastLoginAt ? me.lastLoginAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '—'}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/ganti-sandi" className={btnSecondary}>Ganti Sandi</Link>
            {!me.totpEnabledAt && <Link href="/keamanan/2fa" className={btnSecondary}>Aktifkan 2FA</Link>}
          </div>
        </div>
      </div>
    </>
  );
}
