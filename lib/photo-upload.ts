export const SOURCE_PHOTO_LIMITS = { bytes: 20 * 1024 * 1024, pixels: 64_000_000, edge: 16000 } as const;
export const UPLOAD_PHOTO_LIMITS = { edge: 1600, bytes: 300_000 } as const;

/** Prepare a copy during selection; never change the user's original file. */
export async function prepareUploadPhoto(file: File, url: string): Promise<File> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Use a JPEG or PNG photo. Convert HEIC or other formats first.');
  if (!file.size || file.size > SOURCE_PHOTO_LIMITS.bytes) throw new Error('Choose a nonempty photo no larger than 20 MB.');
  const image = new Image(); image.src = url; await image.decode();
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > SOURCE_PHOTO_LIMITS.pixels || Math.max(image.naturalWidth, image.naturalHeight) > SOURCE_PHOTO_LIMITS.edge) {
    throw new Error('This photo exceeds 64 megapixels or 16000 pixels on one side. Export a smaller copy first.');
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the photos. Try a different browser.');
  let edge: number = UPLOAD_PHOTO_LIMITS.edge;
  try { for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Try moderate compression before sacrificing spatial detail.
    for (const quality of [.85, .8, .75]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw new Error('This browser could not encode the photo. Try a different browser.');
      if (blob.size <= UPLOAD_PHOTO_LIMITS.bytes) return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    }
    edge = Math.round(edge * .85);
  } } finally { canvas.width = 0; canvas.height = 0; }
  throw new Error('A photo could not be reduced for upload. Try a smaller JPEG.');
}
