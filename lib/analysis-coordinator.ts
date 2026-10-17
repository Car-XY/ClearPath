/** Rejects stale results without coupling computation to React, timers, or a worker. */
export class AnalysisCoordinator<T> {
  private revision = 0;

  /** Invalidates pending work, for example when an effect is cleaned up. */
  invalidate(): void { this.revision++; }

  /** Returns true only when this run is still current and its result was applied. */
  async run(compute: () => T | Promise<T>, apply: (value: T) => void): Promise<boolean> {
    const revision = ++this.revision;
    const value = await compute();
    if (revision !== this.revision) return false;
    apply(value);
    return true;
  }
}
