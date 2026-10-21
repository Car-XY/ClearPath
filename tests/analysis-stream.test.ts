import { afterEach, describe, expect, it, vi } from 'vitest';
import { analysisStream } from '../lib/analysis-stream';
import { readPhotoResponse } from '../lib/photo-response';
afterEach(() => vi.useRealTimers());
describe('long-running room analysis connection', () => {
  it('keeps the connection alive, then returns the draft once', async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const response = analysisStream(() => new Promise(resolve => { finish = resolve; }), new AbortController().signal, () => ({ code: 'FAILED' }));
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('status');
    await vi.advanceTimersByTimeAsync(8000);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('status');
    finish({ id: 'room' });
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('result');
    await reader.cancel(); expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates disconnect cancellation to the provider', async () => {
    let signal!: AbortSignal;
    const response = analysisStream(s => { signal = s; return new Promise(() => {}); }, new AbortController().signal, () => ({}));
    await response.body!.cancel(); expect(signal.aborted).toBe(true);
  });
  it('reads split UTF-8 lines and returns an actionable streamed error', async () => {
    const encoder = new TextEncoder(); const bytes = encoder.encode(JSON.stringify({ type: 'status' }) + '\n' + JSON.stringify({ type: 'error', error: { code: 'PROVIDER_TIMEOUT', message: 'Timed out · photos retained' } }) + '\n');
    const response = new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3)); controller.close(); } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
    await expect(readPhotoResponse(response)).resolves.toMatchObject({ error: { code: 'PROVIDER_TIMEOUT', message: 'Timed out · photos retained' } });
  });
  it('explains an interrupted stream instead of asking for clearer photos', async () => {
    await expect(readPhotoResponse(new Response('{"type":"status"}\n', { headers: { 'Content-Type': 'application/x-ndjson' } }))).rejects.toThrow('connection closed');
  });
  it('sanitizes a failed generation and releases the stream', async () => {
    const response = analysisStream(async () => { throw new Error('private upstream'); }, new AbortController().signal, () => ({ code: 'PROVIDER_FAILURE', message: 'Provider unavailable' }));
    await expect(readPhotoResponse(response)).resolves.toEqual({ error: { code: 'PROVIDER_FAILURE', message: 'Provider unavailable' } });
  });
});
