/** Gambar yang diunggah disimpan sebagai data URI di database, sehingga ikut terbawa backup. */
export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

export type UploadedImage = { dataUri: string; mime: string; size: number };

export async function readImageUpload(
  value: FormDataEntryValue | null,
  maxBytes: number,
): Promise<UploadedImage | null | { error: string }> {
  if (!(value instanceof File) || value.size === 0) return null;
  if (!IMAGE_MIMES.includes(value.type)) return { error: 'Format gambar harus JPG, PNG, atau WEBP.' };
  if (value.size > maxBytes) {
    const limit = Math.round((maxBytes / 1024 / 1024) * 10) / 10;
    return { error: `Ukuran gambar maksimal ${limit} MB, sedangkan berkas ini ${(value.size / 1024 / 1024).toFixed(1)} MB.` };
  }
  const base64 = Buffer.from(await value.arrayBuffer()).toString('base64');
  return { dataUri: `data:${value.type};base64,${base64}`, mime: value.type, size: value.size };
}
