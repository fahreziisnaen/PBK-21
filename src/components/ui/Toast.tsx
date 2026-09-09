'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type Kind = 'ok' | 'warn';
type ToastFn = (msg: string, kind?: Kind) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: Kind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ToastFn>((msg, kind = 'ok') => {
    setToast({ msg, kind });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role="status"
          data-noprint
          className="animate-pbkin fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-lg bg-gray-900 px-4 py-3 text-[13px] font-medium text-white shadow-lg"
        >
          <span
            className={
              'h-2 w-2 flex-none rounded-full ' + (toast.kind === 'warn' ? 'bg-warn-500' : 'bg-success-500')
            }
          />
          {toast.msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}
