import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkWaHealth, sendWhatsApp } from '@/lib/wa-gateway';

const config = { baseUrl: 'http://wa.test:3000', apiKey: 'wag_test', instance: 'wa1' };

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('sendWhatsApp', () => {
  it('mengembalikan jobId saat gateway menerima antrean', async () => {
    stubFetch(202, { success: true, jobId: '42' });
    const r = await sendWhatsApp(config, '6281233445566', 'Kode: 123456');
    expect(r).toEqual({ ok: true, jobId: '42' });
  });

  it('mengirim bearer token dan bentuk body yang benar', async () => {
    const fn = stubFetch(202, { success: true, jobId: '1' });
    await sendWhatsApp(config, '6281233445566', 'halo');
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://wa.test:3000/send-message');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer wag_test');
    expect(JSON.parse(init.body as string)).toEqual({
      message: 'halo',
      id: '6281233445566',
      from: 'wa1',
    });
  });

  it('memetakan 422 ke nomor tidak terdaftar', async () => {
    stubFetch(422, { error: 'not registered' });
    const r = await sendWhatsApp(config, '6289999999999', 'x');
    expect(r).toMatchObject({ ok: false, reason: 'unregistered' });
  });

  it('memetakan 503 ke layanan tidak tersedia', async () => {
    stubFetch(503, { error: 'no instance' });
    const r = await sendWhatsApp(config, '6281233445566', 'x');
    expect(r).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('memetakan 401 ke API key salah', async () => {
    stubFetch(401, { error: 'bad key' });
    const r = await sendWhatsApp(config, '6281233445566', 'x');
    expect(r).toMatchObject({ ok: false, reason: 'unauthorized' });
  });

  it('tidak melempar saat jaringan gagal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const r = await sendWhatsApp(config, '6281233445566', 'x');
    expect(r).toMatchObject({ ok: false, reason: 'error' });
  });
});

describe('checkWaHealth', () => {
  it('melaporkan sehat saat /health menjawab ok', async () => {
    stubFetch(200, { ok: true, ts: 1 });
    expect(await checkWaHealth(config)).toMatchObject({ ok: true });
  });

  it('melaporkan tidak sehat saat gateway tak terjangkau', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
    expect(await checkWaHealth(config)).toMatchObject({ ok: false });
  });
});
