/** Hasil standar Server Action form: `undefined` sebelum dikirim. */
export type ActionResult = { ok: boolean; message?: string } | undefined;

export const ok = (message?: string): ActionResult => ({ ok: true, message });
export const fail = (message: string): ActionResult => ({ ok: false, message });
