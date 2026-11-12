export type Listener = () => void;

/** Anything holding a snapshot that components can read and subscribe to. */
export interface Source<T> {
  getState(): T;
  subscribe(listener: Listener): () => void;
}

/** Minimal change notifier shared by the stores. */
export class Emitter {
  private readonly listeners = new Set<Listener>();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  protected emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
