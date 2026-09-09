import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { ToastProvider } from '@/components/ui/Toast';

export default function AppLayout({ children }: { children: React.ReactNode }) {
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
