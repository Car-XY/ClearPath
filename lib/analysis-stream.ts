/** Heartbeats keep an active provider request from looking like an idle upload. */
export function analysisStream<T>(work: (signal: AbortSignal) => Promise<T>, signal: AbortSignal, toError: (error: unknown) => unknown) {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const cancel = () => abort.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const cleanup = () => { if (timer) clearInterval(timer); signal.removeEventListener('abort', cancel); };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (value: unknown) => { if (!stopped) controller.enqueue(encoder.encode(JSON.stringify(value) + '\n')); };
      send({ type: 'status', stage: 'analyzing' });
      timer = setInterval(() => send({ type: 'status', stage: 'analyzing' }), 8000);
      work(abort.signal).then(project => send({ type: 'result', project })).catch(error => send({ type: 'error', error: toError(error) })).finally(() => {
        cleanup(); if (!stopped) { stopped = true; controller.close(); }
      });
    },
    cancel() { stopped = true; abort.abort(); cleanup(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store, no-transform', 'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no' } });
}
