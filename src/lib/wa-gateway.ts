export type WaConfig = { baseUrl: string; apiKey: string; instance?: string };

export type WaResult =
  | { ok: true; jobId: string }
  | { ok: false; reason: 'unregistered' | 'unavailable' | 'unauthorized' | 'error'; detail: string };

const TIMEOUT_MS = 10_000;

/**
 * A 202 from the gateway means "queued", not "delivered" — the gateway
 * gives no delivery confirmation, so neither do we.
 */
export async function sendWhatsApp(config: WaConfig, to: string, message: string): Promise<WaResult> {
  try {
    const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ message, id: to, ...(config.instance ? { from: config.instance } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 202 || res.status === 200) {
      // The gateway has accepted the message by this point. A body we cannot
      // parse must not turn an accepted send into a reported failure — the
      // caller would retry and deliver a second OTP.
      let jobId = 'unknown';
      try {
        const body = (await res.json()) as { jobId?: string };
        if (body.jobId != null) jobId = String(body.jobId);
      } catch {
        // keep the sentinel
      }
      return { ok: true, jobId };
    }

    const detail = `HTTP ${res.status}`;
    if (res.status === 422) return { ok: false, reason: 'unregistered', detail };
    if (res.status === 503) return { ok: false, reason: 'unavailable', detail };
    if (res.status === 401) return { ok: false, reason: 'unauthorized', detail };
    return { ok: false, reason: 'error', detail };
  } catch (e) {
    return { ok: false, reason: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function checkWaHealth(config: WaConfig): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
