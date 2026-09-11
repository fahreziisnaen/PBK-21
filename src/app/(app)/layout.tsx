import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { ToastProvider } from '@/components/ui/Toast';
import { requireUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { nextGate } from '@/lib/auth-gates';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await requireUser();
  // nextGate needs fields the JWT session never carries (see
  // src/types/next-auth.d.ts) — re-read them fresh from the database rather
  // than trusting a stale session, so a password change or TOTP enrolment
  // takes effect on the very next request instead of waiting for re-login.
  const gateUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      mustChangePassword: true,
      totpEnabledAt: true,
      phone: true,
      role: true,
    },
  });

  if (gateUser) {
    const gate = nextGate(gateUser);
    if (gate) {
      // Redirect unless we are already rendering the gate's own destination
      // — otherwise a guest sent to e.g. /ganti-sandi would be redirected
      // to /ganti-sandi forever. See src/proxy.ts for where x-pathname
      // comes from.
      const pathname = (await headers()).get('x-pathname');
      if (pathname !== gate) redirect(gate);
    }
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen max-[900px]:flex-col">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="animate-pbkin flex-1 px-6 py-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
