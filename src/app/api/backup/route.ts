import { requireRole } from '@/lib/auth-guard';
import { createBackup } from '@/lib/maintenance';
import { writeAudit } from '@/lib/audit';

/** Unduh seluruh data aplikasi sebagai file JSON. Khusus superadmin. */
export async function GET() {
  const user = await requireRole('SUPERADMIN');
  const backup = await createBackup();
  await writeAudit({ userId: user.id, action: 'system.backup', entity: 'System', entityId: 'backup', meta: backup.counts });

  const stamp = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date())
    .replace(' ', '-')
    .replace(':', '');

  return new Response(JSON.stringify(backup), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="pbk-backup-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
