/**
 * Wake-up calls for the scheduler, paced by the audio hardware itself.
 *
 * A tiny AudioWorklet counts render quanta (128 frames each) on the audio thread and
 * posts a message every few of them, about every 11 ms at 48 kHz. It is not the clock:
 * the scheduler always reads AudioContext.currentTime. Unlike main-thread timers it is
 * not slowed down in background tabs.
 */

const PROCESSOR = 'mono-ticker';

const SOURCE = `
class MonoTicker extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.every = Math.max(1, options.processorOptions.quanta | 0);
    this.count = 0;
  }
  process() {
    if (++this.count >= this.every) {
      this.count = 0;
      this.port.postMessage(0);
    }
    return true;
  }
}
registerProcessor('${PROCESSOR}', MonoTicker);
`;

export interface AudioTicker {
  dispose(): void;
}

/** Calls `onTick` every `quanta` render quanta. Call once per AudioContext. */
export async function startTicker(
  context: AudioContext,
  onTick: () => void,
  quanta = 4,
): Promise<AudioTicker> {
  if (context.audioWorklet) {
    const url = URL.createObjectURL(new Blob([SOURCE], { type: 'text/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(context, PROCESSOR, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { quanta },
      });
      node.port.onmessage = () => onTick();
      // A node is only processed when it reaches the destination; it outputs silence.
      node.connect(context.destination);
      return {
        dispose() {
          node.port.onmessage = null;
          node.disconnect();
        },
      };
    } catch (error) {
      console.warn('M.O.N.O.: AudioWorklet no disponible, uso un temporizador de respaldo.', error);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Fallback where AudioWorklet is missing (e.g. a page not served from https or localhost).
  // The timer only wakes the scheduler up; musical time still comes from currentTime.
  const ms = ((quanta * 128) / context.sampleRate) * 1000;
  let timer = setTimeout(function wake() {
    onTick();
    timer = setTimeout(wake, ms);
  }, ms);
  return {
    dispose() {
      clearTimeout(timer);
    },
  };
}
