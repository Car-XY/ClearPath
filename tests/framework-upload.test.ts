import { describe, it, expect } from 'vitest';

import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import nextConfig from '../next.config';
import { PHOTO_LIMITS } from '../lib/photo-provider';

// Exercise the installed runtime: mocking /api/analyze bypasses the gate that
// caused the real four-photo HTTP 413 failure.
const runtimeRoot = path.dirname(fileURLToPath(import.meta.resolve('vinext')));
const configApi = await import(/* @vite-ignore */ pathToFileURL(path.join(runtimeRoot, 'config/next-config.js')).href);
const actionApi = await import(/* @vite-ignore */ pathToFileURL(path.join(runtimeRoot, 'server/app-server-action-execution.js')).href);
async function dispatch(maxActionBodySize: number) {
  const form = new FormData();
  for (let i = 0; i < 4; i++) form.append('photos', new File([new Uint8Array(280_000)], `room-${i}.jpg`, { type: 'image/jpeg' }));

  // Reuse the generated boundary when reconstructing the request.
  const encoded = new Response(form);
  const bytes = await encoded.arrayBuffer();
  const request = new Request('http://localhost/api/analyze', { method: 'POST', headers: { 'content-type': encoded.headers.get('content-type')!, 'content-length': String(bytes.byteLength) }, body: bytes });
  let parsed = false;
  const result = await actionApi.handleProgressiveServerActionRequest({
    request, contentType: request.headers.get('content-type'), actionId: null, allowedOrigins: [], maxActionBodySize, hasPageRoute: false,
    clearRequestContext() {}, getAndClearPendingCookies() { return []; },
    async readFormDataWithLimit(input: Request) { parsed = true; return input.formData(); },
    decodeAction() { return null; },
  });
  return { result, parsed, bytes: bytes.byteLength };
}
describe('multipart request dispatch regression', () => {
  it('reproduces the default framework rejection of four valid prepared photos', async () => {
    const outcome = await dispatch(configApi.parseBodySizeLimit(undefined));
    expect(outcome.bytes).toBeGreaterThan(1024 * 1024);
    expect(outcome.result.status).toBe(413); expect(outcome.parsed).toBe(false);
  });
  it('lets that request reach the API route with the application configuration', async () => {
    const resolved = await configApi.resolveNextConfig(nextConfig);
    expect(resolved.serverActionsBodySizeLimit).toBe(PHOTO_LIMITS.request);
    const outcome = await dispatch(resolved.serverActionsBodySizeLimit);
    expect(outcome.parsed).toBe(true); expect(outcome.result).toBeNull();
  });
});

