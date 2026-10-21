import { describe, it, expect } from 'vitest';
import { readPhotoResponse } from '../lib/photo-response';
describe('photo response errors', () => {
  it('explains a plain-text upload rejection', async () => {
    await expect(readPhotoResponse(new Response('Payload Too Large', { status: 413 }))).rejects.toThrow('too large');
  });
  it('handles non-JSON proxy failures', async () => {
    await expect(readPhotoResponse(new Response('<html>Bad gateway</html>', { status: 502 }))).rejects.toThrow('HTTP 502');
  });
  it('preserves structured responses', async () => {
    await expect(readPhotoResponse(Response.json({ project: {} }))).resolves.toEqual({ project: {} });
  });
});
