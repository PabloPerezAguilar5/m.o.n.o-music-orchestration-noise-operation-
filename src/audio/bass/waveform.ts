import { SLICES } from '../../core/slice';

/** Columns of the wave strip per bar of the loop: 32 per piece. */
export const WAVE_COLUMNS_PER_BAR = SLICES * 32;

/**
 * The shape of a loop for the wave strip: the peak (0..1) of each of `columns` equal
 * stretches of the buffer, all channels together. `columns` is WAVE_COLUMNS_PER_BAR
 * per bar, so the strip can show one bar at a time.
 */
export function wavePeaks(buffer: AudioBuffer, bars: number): Float32Array {
  const columns = WAVE_COLUMNS_PER_BAR * Math.max(1, bars);
  const peaks = new Float32Array(columns);
  const frames = buffer.length;
  if (frames === 0) return peaks;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let column = 0; column < columns; column++) {
      const from = Math.floor((column / columns) * frames);
      const to = Math.max(from + 1, Math.floor(((column + 1) / columns) * frames));
      let peak = peaks[column]!;
      for (let i = from; i < to; i++) {
        const value = Math.abs(data[i]!);
        if (value > peak) peak = value;
      }
      peaks[column] = Math.min(1, peak);
    }
  }
  return peaks;
}
