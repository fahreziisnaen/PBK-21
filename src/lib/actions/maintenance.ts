'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth-guard';
import { factoryReset, restoreBackup, TABLE_LABELS } from '@/lib/maintenance';
import { writeAudit } from '@/lib/audit';
import { fail, ok, type ActionResult } from '@/lib/action-result';

function summary(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `${n} ${TABLE_LABELS[name]?.toLowerCase() ?? name}`)
    .join(', ');
}

export async function restoreFromUpload(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');
  if (String(fd.get('confirm') ?? '').trim() !== 'PULIHKAN') return fail('Ketik PULIHKAN (huruf besar) untuk mengonfirmasi.');
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('Pilih file backup (.json) lebih dulu.');

  const result = await restoreBackup(await file.text());
  if (!result.ok) return fail(result.error);

  // Jejak audit ikut terganti oleh isi backup, jadi catatan restore ditulis sesudahnya.
  await writeAudit({ userId: actor.id, action: 'system.restore', entity: 'System', entityId: 'restore', meta: { file: file.name, ...result.counts } });
  revalidatePath('/', 'layout');
  return ok(`Data dipulihkan dari ${file.name}: ${summary(result.counts) || 'backup kosong'}. Bila akun Anda berbeda di backup, silakan login ulang.`);
}

export async function runFactoryReset(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireRole('SUPERADMIN');
  if (String(fd.get('confirm') ?? '').trim() !== 'RESET') return fail('Ketik RESET (huruf besar) untuk mengonfirmasi.');

  const removed = await factoryReset();
  await writeAudit({ userId: actor.id, action: 'system.factory_reset', entity: 'System', entityId: 'reset', meta: removed });
  revalidatePath('/', 'layout');
  return ok(`Factory reset selesai. Dihapus: ${summary(removed) || 'tidak ada data'}.`);
}
