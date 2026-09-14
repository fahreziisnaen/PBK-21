import type { User } from '@prisma/client';
import { PageHead } from '@/components/shell/PageHead';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmAction } from '@/components/ui/ConfirmAction';
import { requireUser } from '@/lib/auth-guard';
import { isAdmin } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { createUser, resetUserPassword, resetUserTotp, toggleUserActive, updateUser } from '@/lib/actions/users';
import { formatPhoneLocal } from '@/lib/phone';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import { btnGhost, card, input, label, mono, table, tableWrap, td, th } from '@/lib/ui';

const ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: 'Superadmin',
  ADMIN: 'Admin',
  BENDAHARA: 'Bendahara',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
};

function RoleSelect({ value, allowSuper }: { value?: string; allowSuper: boolean }) {
  return (
    <select id="role" name="role" required defaultValue={value ?? 'BENDAHARA'} className={input}>
      <option value="BENDAHARA">Bendahara — catat transaksi, siswa, kegiatan</option>
      <option value="ADMIN">Admin — plus master data dan kelola pengguna</option>
      <option value="KEPALA_SEKOLAH">Kepala Sekolah — hanya melihat</option>
      {allowSuper && <option value="SUPERADMIN">Superadmin — akses penuh</option>}
    </select>
  );
}

function Pill({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${on ? 'bg-success-50 text-success-700' : 'bg-gray-100 text-gray-600'}`}>
      {on ? yes : no}
    </span>
  );
}

export default async function PenggunaPage() {
  const me = await requireUser();
  if (!isAdmin(me.role)) {
    return (
      <>
        <PageHead pathname="/pengguna" />
        <div className={`${card} p-10 text-center text-[13px] text-gray-600`}>Halaman ini hanya untuk Admin dan Superadmin.</div>
      </>
    );
  }
  const superadmin = me.role === 'SUPERADMIN';
  const users = await prisma.user.findMany({ orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { username: 'asc' }] });
  const editable = (u: User) => superadmin || u.role !== 'SUPERADMIN';

  return (
    <>
      <PageHead
        pathname="/pengguna"
        actions={
          <FormModal trigger="+ Tambah Pengguna" title="Tambah Pengguna" action={createUser}>
            <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
              <div>
                <label className={label} htmlFor="username">Username</label>
                <input id="username" name="username" required autoComplete="off" className={`${input} lowercase`} placeholder="mis. budi.santoso" />
              </div>
              <div>
                <label className={label} htmlFor="name">Nama Lengkap</label>
                <input id="name" name="name" required className={input} />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="role">Peran</label>
              <RoleSelect allowSuper={superadmin} />
            </div>
            <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
              <div>
                <label className={label} htmlFor="phone">No. WhatsApp</label>
                <input id="phone" name="phone" inputMode="tel" className={input} placeholder="081234567890" />
              </div>
              <div>
                <label className={label} htmlFor="password">Sandi Awal</label>
                <input id="password" name="password" type="text" required minLength={MIN_PASSWORD_LENGTH} autoComplete="off" className={input} />
              </div>
            </div>
            <p className="text-[12px] text-gray-500">
              Pengguna akan diminta mengganti sandi awal dan mendaftarkan verifikasi dua langkah saat login pertama.
            </p>
          </FormModal>
        }
      />

      <div className={tableWrap}>
        <table className={`${table} min-w-[980px]`}>
          <thead>
            <tr>
              <th className={th}>Username</th>
              <th className={th}>Nama</th>
              <th className={th}>Peran</th>
              <th className={th}>WhatsApp</th>
              <th className={th}>2FA</th>
              <th className={th}>Login Terakhir</th>
              <th className={th}>Status</th>
              <th className={th}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.isActive ? '' : 'opacity-60'}>
                <td className={`${td} ${mono} font-semibold text-gray-900`}>{u.username}{u.id === me.id && <span className="ml-1 text-[11px] text-gray-400">(Anda)</span>}</td>
                <td className={td}>{u.name}</td>
                <td className={td}>{ROLE_LABEL[u.role]}</td>
                <td className={`${td} ${mono}`}>{u.phone ? formatPhoneLocal(u.phone) : '—'}</td>
                <td className={td}><Pill on={!!u.totpEnabledAt} yes="Aktif" no="Belum" /></td>
                <td className={`${td} whitespace-nowrap`}>
                  {u.lastLoginAt ? u.lastLoginAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                </td>
                <td className={td}><Pill on={u.isActive} yes="Aktif" no="Nonaktif" /></td>
                <td className={`${td} whitespace-nowrap`}>
                  {editable(u) && (
                    <>
                      <FormModal trigger="Edit" triggerClassName={btnGhost} title={`Edit ${u.username}`} action={updateUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <div>
                          <label className={label} htmlFor="name">Nama Lengkap</label>
                          <input id="name" name="name" required defaultValue={u.name} className={input} />
                        </div>
                        <div>
                          <label className={label} htmlFor="role">Peran</label>
                          <RoleSelect value={u.role} allowSuper={superadmin} />
                        </div>
                        <div>
                          <label className={label} htmlFor="phone">No. WhatsApp</label>
                          <input id="phone" name="phone" inputMode="tel" defaultValue={u.phone ? formatPhoneLocal(u.phone) : ''} className={input} />
                        </div>
                      </FormModal>
                      <FormModal trigger="Reset Sandi" triggerClassName={btnGhost} title={`Reset Sandi ${u.username}`} submitLabel="Reset" action={resetUserPassword}>
                        <input type="hidden" name="id" value={u.id} />
                        <div>
                          <label className={label} htmlFor="password">Sandi Sementara</label>
                          <input id="password" name="password" type="text" required minLength={MIN_PASSWORD_LENGTH} autoComplete="off" className={input} />
                        </div>
                        <p className="text-[12px] text-gray-500">Semua sesi {u.username} berakhir, dan ia wajib mengganti sandi ini saat login.</p>
                      </FormModal>
                      {u.totpEnabledAt && (
                        <ConfirmAction
                          label="Reset 2FA"
                          title="Reset Verifikasi Dua Langkah"
                          body={`Aplikasi authenticator milik ${u.username} tidak akan berlaku lagi.`}
                          bullets={['Dipakai bila ponselnya hilang atau diganti.', 'Ia akan diminta mendaftarkan ulang saat login berikutnya.']}
                          confirmLabel="Reset 2FA"
                          tone="warn"
                          run={resetUserTotp.bind(null, u.id)}
                        />
                      )}
                      {u.id !== me.id && (
                        <ConfirmAction
                          label={u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          className={u.isActive ? undefined : btnGhost}
                          title={u.isActive ? 'Nonaktifkan Pengguna' : 'Aktifkan Pengguna'}
                          body={u.isActive ? `${u.username} tidak akan bisa login dan sesinya berakhir.` : `${u.username} bisa login kembali.`}
                          bullets={u.isActive ? ['Seluruh transaksi yang pernah ia catat tetap tersimpan.'] : []}
                          confirmLabel={u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          tone="warn"
                          run={toggleUserActive.bind(null, u.id)}
                        />
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
