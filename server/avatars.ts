import sharp from 'sharp';
export type SaveAvatar = (ownerId: string, id: string, bytes: Buffer) => Promise<void>;
export const validAvatarId = (id: string) => /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
export async function normalizeAvatar(input: unknown): Promise<Buffer> {
  if (typeof input !== 'string' || input.length > 28000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(input))
    throw Error('Choose a PNG, JPEG or WebP profile image.');
  const bytes = Buffer.from(input.slice(input.indexOf(',') + 1), 'base64');
  try {
    const processor = sharp(bytes, {limitInputPixels: 1_000_000, animated: false});
    const meta = await processor.metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1) throw Error('Unsupported image');
    // Decode and re-encode; never serve user-supplied markup or metadata.
    const safe = await processor.rotate().resize(160, 160, {fit:'cover'}).webp({quality:75}).toBuffer();
    if (safe.length > 24576) throw Error('Image too complex');
    return safe;
  } catch { throw Error('Could not read that image. Try a different PNG, JPEG or WebP.'); }
}
