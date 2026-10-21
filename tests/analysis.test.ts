import { describe, expect, it, vi } from 'vitest';
import { AnalysisCoordinator } from '../lib/analysis-coordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('analysis result coordination', () => {
  it('cannot overwrite a newer blocked result with an older clear result', async () => {
    const coordinator = new AnalysisCoordinator<{ status: 'red' | 'green'; projectRevision: number }>();
    const old = deferred<{ status: 'red' | 'green'; projectRevision: number }>();
    const applied: { status: 'red' | 'green'; projectRevision: number }[] = [];
    const oldRun = coordinator.run(() => old.promise, value => applied.push(value));
    const newRun = coordinator.run(() => ({ status: 'red', projectRevision: 2 }), value => applied.push(value));
    expect(await newRun).toBe(true);
    old.resolve({ status: 'green', projectRevision: 1 });
    expect(await oldRun).toBe(false);
    expect(applied).toEqual([{ status: 'red', projectRevision: 2 }]);
  });

  it('cancels application of pending results when invalidated', async () => {
    const coordinator = new AnalysisCoordinator<string>(), pending = deferred<string>(), apply = vi.fn();
    const run = coordinator.run(() => pending.promise, apply);
    coordinator.invalidate(); pending.resolve('obsolete');
    expect(await run).toBe(false); expect(apply).not.toHaveBeenCalled();
    expect(await coordinator.run(() => 'current', apply)).toBe(true);
    expect(apply).toHaveBeenCalledExactlyOnceWith('current');
  });

  it('invalidates synchronous results before their awaited application', async () => {
    const coordinator = new AnalysisCoordinator<string>(), apply = vi.fn();
    const run = coordinator.run(() => 'stale', apply);
    coordinator.invalidate();
    expect(await run).toBe(false); expect(apply).not.toHaveBeenCalled();
  });

  it('lets only the newest async run apply regardless of completion order', async () => {
    const coordinator = new AnalysisCoordinator<number>(), first = deferred<number>(), second = deferred<number>(), apply = vi.fn();
    const a = coordinator.run(() => first.promise, apply), b = coordinator.run(() => second.promise, apply);
    first.resolve(1); expect(await a).toBe(false); expect(apply).not.toHaveBeenCalled();
    second.resolve(2); expect(await b).toBe(true); expect(apply).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('propagates computation errors without applying an invented result', async () => {
    const coordinator = new AnalysisCoordinator<string>(), pending = deferred<string>(), apply = vi.fn();
    const run = coordinator.run(() => pending.promise, apply);
    const assertion = expect(run).rejects.toThrow('analysis failed');
    pending.reject(new Error('analysis failed')); await assertion;
    expect(apply).not.toHaveBeenCalled();
  });
});
