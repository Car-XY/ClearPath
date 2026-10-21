/** Hosts can reject requests before the API runs, returning plain text. */
export async function readPhotoResponse(response: Response): Promise<unknown> {
  if (response.status === 413) throw new Error('The photo upload is too large for this server. Try fewer photos or smaller JPEG files. Your selected photos are still available.');
  if (response.headers.get('content-type')?.includes('application/x-ndjson')) {
    if (!response.body) throw new Error('The room service returned an empty stream. Your photos are still selected.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (value) { bytes += value.byteLength; buffer += decoder.decode(value, { stream: true }); }
        if (bytes > 2 * 1024 * 1024) throw new Error('The room service response exceeded the supported size. Retry or create a manual room.');
        if (done) buffer += decoder.decode();
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0 || (done && buffer.trim().length)) {
          const line = newline >= 0 ? buffer.slice(0, newline) : buffer;
          buffer = newline >= 0 ? buffer.slice(newline + 1) : '';
          if (!line.trim()) continue;
          let event: { type?: string; project?: unknown; error?: unknown };
          try { event = JSON.parse(line); } catch { throw new Error('The room service returned an unreadable update. Your photos are still selected; retry.'); }
          if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('The room service returned an invalid update. Your photos are still selected; retry.');
          if (event.type === 'result') return { project: event.project };
          if (event.type === 'error') return { error: event.error };
        }
        if (done) break;
      }
      throw new Error('The connection closed before the room draft arrived. Your photos are still selected. Retry or use a manual room.');
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  try { return await response.json(); }
  catch { throw new Error(`The photo service returned an unreadable response (HTTP ${response.status}). Please retry or use fewer photos.`); }
}
