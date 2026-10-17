import { afterEach, describe, it, expect, vi } from 'vitest';
import { prepareUploadPhoto } from '../lib/photo-upload';
afterEach(() => vi.unstubAllGlobals());
function browserImage(width: number, height: number, sizes: number[] = [200_000]) {
  const encodes: { width: number; height: number; quality: number }[] = [];
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
  const canvas = { width: 0, height: 0, getContext: () => context,
    toBlob(callback: (blob: Blob | null) => void, _mime: string, quality: number) {
      encodes.push({ width: this.width, height: this.height, quality });
      callback(new Blob([new Uint8Array(sizes[Math.min(encodes.length - 1, sizes.length - 1)])], { type: 'image/jpeg' }));
    } };
  vi.stubGlobal('Image', class { src = ''; naturalWidth = width; naturalHeight = height; async decode() {} });
  vi.stubGlobal('document', { createElement: () => canvas });
  return { encodes, canvas };
}
describe('automatic photo preparation', () => {
  it('accepts a 48 MP phone photo over 5 MB and fits the upload budget', async () => {
    const { encodes, canvas } = browserImage(8000, 6000);
    const original = new File([new Uint8Array(6 * 1024 * 1024)], 'phone.png', { type: 'image/png' });
    const result = await prepareUploadPhoto(original, 'blob:test');
    expect(encodes).toEqual([{ width: 1600, height: 1200, quality: .85 }]);
    expect(result.size).toBeLessThanOrEqual(300_000);
    expect(result.type).toBe('image/jpeg'); expect(result.name).toBe('phone.jpg');
    expect(original.size).toBe(6 * 1024 * 1024); expect(original.type).toBe('image/png');
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });
  it('tries moderate compression before reducing resolution', async () => {
    const { encodes } = browserImage(4000, 3000, [400_000, 350_000, 320_000, 200_000]);
    await prepareUploadPhoto(new File(['original'], 'room.jpg', { type: 'image/jpeg' }), 'blob:test');
    expect(encodes).toEqual([
      { width: 1600, height: 1200, quality: .85 }, { width: 1600, height: 1200, quality: .8 },
      { width: 1600, height: 1200, quality: .75 }, { width: 1360, height: 1020, quality: .85 },
    ]);
  });
  it.each([[1200, 1600, 1200, 1600], [640, 480, 640, 480]])('preserves aspect ratio and does not upscale %sx%s', async (w, h, expectedW, expectedH) => {
    const { encodes } = browserImage(w, h);
    await prepareUploadPhoto(new File(['image'], 'portrait.jpg', { type: 'image/jpeg' }), 'blob:test');
    expect(encodes[0]).toMatchObject({ width: expectedW, height: expectedH });
  });
  it('rejects inputs beyond the source memory limits before encoding', async () => {
    const { encodes } = browserImage(10000, 10000);
    await expect(prepareUploadPhoto(new File(['image'], 'huge.jpg', { type: 'image/jpeg' }), 'blob:test')).rejects.toThrow('64 megapixels');
    expect(encodes).toHaveLength(0);
  });
  it('rejects empty, unsupported and oversized source files', async () => {
    await expect(prepareUploadPhoto(new File([], 'empty.jpg', { type: 'image/jpeg' }), '')).rejects.toThrow('nonempty');
    await expect(prepareUploadPhoto(new File(['image'], 'room.heic', { type: 'image/heic' }), '')).rejects.toThrow('JPEG or PNG');
    await expect(prepareUploadPhoto(new File([new Uint8Array(21 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' }), '')).rejects.toThrow('20 MB');
  });
  it('fails cleanly if the browser cannot fit the upload budget', async () => {
    const { canvas } = browserImage(4000, 3000, [500_000]);
    await expect(prepareUploadPhoto(new File(['image'], 'room.jpg', { type: 'image/jpeg' }), '')).rejects.toThrow('reduced for upload');
    expect(canvas.width).toBe(0);
  });
});
