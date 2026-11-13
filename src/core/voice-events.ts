/**
 * What a sequencer asks of a synth voice engine, at audio times (seconds). Shared by
 * BASS and SYNTH. `id` ties a note-off to its note, so a stale note-off never cuts a
 * newer note (mono) and each chord note is released on its own (poly).
 */
export type VoiceEvent =
  | {
      readonly type: 'on';
      readonly time: number;
      readonly id: number;
      readonly midi: number;
      readonly accent: boolean;
      /** Glide from the sounding note without retriggering the envelopes (mono slide). */
      readonly legato: boolean;
    }
  | { readonly type: 'off'; readonly time: number; readonly id: number };
