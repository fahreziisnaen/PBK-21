import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

afterEach(cleanup);

const baseProps = {
  title: 'Batalkan Pembayaran OC-X/0088',
  body: 'Pembayaran Rp250.000 dari Ahmad Fauzan (X) akan dibatalkan.',
  bullets: ['Transaksi tetap tersimpan dalam riwayat dan jejak audit.'],
  confirmLabel: 'Ya, Batalkan Pembayaran',
};

describe('ConfirmDialog', () => {
  it('memindahkan fokus ke tombol Batal saat dialog dibuka', () => {
    render(<ConfirmDialog open {...baseProps} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('button', { name: 'Batal' })).toHaveFocus();
  });

  it('menutup dialog melalui onCancel saat Escape ditekan', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open {...baseProps} onConfirm={() => {}} onCancel={onCancel} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('menjebak Tab agar fokus tetap berputar di dalam dialog', () => {
    render(<ConfirmDialog open {...baseProps} onConfirm={() => {}} onCancel={() => {}} />);
    const cancelBtn = screen.getByRole('button', { name: 'Batal' });
    const confirmBtn = screen.getByRole('button', { name: baseProps.confirmLabel });

    confirmBtn.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(cancelBtn).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(confirmBtn).toHaveFocus();
  });

  it('mengembalikan fokus ke elemen pemicu setelah dialog ditutup lewat Batal', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Buka dialog
          </button>
          <ConfirmDialog
            open={open}
            {...baseProps}
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Buka dialog' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('button', { name: 'Batal' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));

    expect(trigger).toHaveFocus();
  });
});
