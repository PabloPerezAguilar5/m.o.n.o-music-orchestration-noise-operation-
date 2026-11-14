import type { SliceWave } from '../audio/backend';
import { Emitter, type Source } from './emitter';

/**
 * The shape of each decoded BASS loop (its peaks), as the backend reports them, for the
 * wave strip. Drawing data only: never stored or saved. Kept by loop id, so going back
 * to a loop heard before draws it at once.
 */
export class SliceMonitor extends Emitter implements Source<ReadonlyMap<string, SliceWave>> {
  private waves: ReadonlyMap<string, SliceWave> = new Map();

  readonly getState = (): ReadonlyMap<string, SliceWave> => this.waves;

  set(wave: SliceWave): void {
    const next = new Map(this.waves);
    next.set(wave.id, wave);
    this.waves = next;
    this.emit();
  }

  get(id: string): SliceWave | undefined {
    return this.waves.get(id);
  }
}
