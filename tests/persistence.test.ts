import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemo } from '../lib/demo';
import { deleteProject, loadProject, saveProject } from '../lib/persistence';

// A deterministic storage adapter mock. Browser tests exercise native IndexedDB.
function mockIndexedDB(failWrites = false) {
  const data = new Map<string, unknown>();
  const close = vi.fn();
  const database = {
    close,
    transaction() {
      const transaction = { oncomplete: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined, onabort: undefined as (() => void) | undefined,
        objectStore() { return {
          put(value: unknown, key: string) {
            queueMicrotask(() => { if (failWrites) transaction.onerror?.(); else { data.set(key, structuredClone(value)); transaction.oncomplete?.(); } });
          },
          get(key: string) {
            const request = { result: undefined as unknown, onsuccess: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined };
            queueMicrotask(() => { request.result = structuredClone(data.get(key)); request.onsuccess?.(); transaction.oncomplete?.(); });
            return request;
          },
          delete(key: string) { queueMicrotask(() => { data.delete(key); transaction.oncomplete?.(); }); },
        }; },
      };
      return transaction;
    },
  };
  const indexedDB = { open() {
    const request = { result: database, onsuccess: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined };
    queueMicrotask(() => request.onsuccess?.()); return request;
  } };
  vi.stubGlobal('indexedDB', indexedDB);
  return { data, close };
}
afterEach(() => vi.unstubAllGlobals());

describe('project persistence through a mocked IndexedDB adapter', () => {
  it('saves, reloads, and deletes the active project', async () => {
    const storage = mockIndexedDB(), project = createDemo();
    expect(await loadProject()).toBeNull();
    await saveProject(project);
    expect((await loadProject())?.furniture).toEqual(project.furniture);
    expect(storage.close).toHaveBeenCalled();
    await deleteProject(); expect(await loadProject()).toBeNull();
  });
  it('requires explicit opt-in before storing source image bytes', async () => {
    mockIndexedDB(); const project = createDemo();
    project.photos = [{ id: 'photo-1', name: 'My room.jpg', dataUrl: 'data:image/jpeg;base64,pixels' }];
    await saveProject(project); expect((await loadProject())?.photos[0].dataUrl).toBeUndefined();
    await saveProject(project, { includePhotos: true }); expect((await loadProject())?.photos[0].dataUrl).toContain('pixels');
    expect(project.photos[0].dataUrl).toContain('pixels');
  });
  it('preserves the in-memory project when storage fails', async () => {
    mockIndexedDB(true); const project = createDemo(), snapshot = JSON.stringify(project);
    await expect(saveProject(project)).rejects.toThrow(/room remains in memory/);
    expect(JSON.stringify(project)).toBe(snapshot);
  });
  it('reports unavailable storage and rejects a corrupt persisted project without deleting it', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(loadProject()).rejects.toThrow(/storage is unavailable/);
    const storage = mockIndexedDB(); storage.data.set('active-project', { schemaVersion: 99 });
    await expect(loadProject()).rejects.toThrow(/failed validation/);
    expect(storage.data.has('active-project')).toBe(true);
  });
});
