import { test, expect } from '@playwright/test';
import { encode } from 'fast-png';
import { decode } from 'jpeg-js';

test('eight phone-size originals are resized before validation and sent as bounded JPEG copies', async ({ page }) => {
  let uploaded: { type: string; size: number; width: number; height: number }[] = [];
  await page.route('**/api/config', route => route.fulfill({ json: { configured: true, provider: 'Anthropic' } }));
  await page.route('**/api/analyze', async route => {
    const request = route.request();
    const form = await new Response(new Uint8Array(request.postDataBuffer()!), { headers: { 'Content-Type': request.headers()['content-type'] } }).formData();
    uploaded = await Promise.all((form.getAll('photos') as File[]).map(async file => {
      const image = decode(new Uint8Array(await file.arrayBuffer()), { useTArray: true });
      return { type: file.type, size: file.size, width: image.width, height: image.height };
    }));
    await route.fulfill({ status: 422, json: { error: { message: 'Upload fixture received; no provider was called.' } } });
  });
  await page.goto('/'); await page.locator('main[data-ready=true]').waitFor();
  await page.getByRole('button', { name: 'Scan my room', exact: true }).click();
  const width = 4032, height = 3024;
  const data = new Uint8Array(width * height * 4).fill(255);
  const files = Array.from({ length: 8 }, (_, index) => {
    for (let pixel = 0; pixel < data.length; pixel += 4) data[pixel] = index * 20;
    return { name: `phone-${index}.png`, mimeType: 'image/png', buffer: Buffer.from(encode({ width, height, data, channels: 4 })) };
  });
  await page.locator('input[type=file][multiple]').setInputFiles(files);
  await expect(page.getByRole('img', { name: /Room view/ })).toHaveCount(8);
  await expect(page.locator('.ph-photo-caption')).toHaveCount(8);
  await expect(page.locator('.ph-photo-caption').first()).toContainText('1600 × 1200');
  await expect(page.getByRole('button', { name: 'Add photos', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: /I agree to send these room photos/ }).check();
  await page.getByRole('button', { name: 'Create room estimate', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Upload fixture received');
  expect(uploaded).toHaveLength(8);
  for (const file of uploaded) {
    expect(file.type).toBe('image/jpeg'); expect(file.size).toBeLessThanOrEqual(300_000);
    expect(file.width).toBe(1600); expect(file.height).toBe(1200);
  }
  expect(uploaded.reduce((sum, file) => sum + file.size, 0)).toBeLessThanOrEqual(2_400_000);
});
