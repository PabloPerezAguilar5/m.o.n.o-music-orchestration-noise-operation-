import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { Source } from '../state';

/**
 * Subscribes a component to one slice of a store. The host re-renders only
 * when the selected value changes identity.
 */
export class Selector<S, T> implements ReactiveController {
  value: T;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly source: Source<S>,
    private readonly select: (state: S) => T,
  ) {
    this.value = select(source.getState());
    host.addController(this);
  }

  hostConnected(): void {
    this.refresh();
    this.unsubscribe = this.source.subscribe(this.refresh);
  }

  hostDisconnected(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private readonly refresh = (): void => {
    const next = this.select(this.source.getState());
    if (Object.is(next, this.value)) return;
    this.value = next;
    this.host.requestUpdate();
  };
}
