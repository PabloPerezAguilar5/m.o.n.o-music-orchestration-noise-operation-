import { css, unsafeCSS } from 'lit';

/**
 * Screens with little height (a phone on its side: 844x390, down to 360 px tall). The
 * layout changes only under this query: taller screens are untouched. See docs/LAYOUT.md.
 */
export const SHORT_SCREEN_QUERY = '(max-height: 600px)';
export const SHORT = unsafeCSS(SHORT_SCREEN_QUERY);

/** Base rules every component needs, since document styles stop at the shadow boundary. */
export const reset = css`
  * {
    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      animation: none !important;
    }
  }
`;

/** Cream hardware key, as used on the chassis. */
export const hardwareKey = css`
  background: linear-gradient(#a9a598, #8f8b7e);
  border: 1px solid #2a2a33;
  color: #1b1b22;
  font-weight: 700;
`;

/**
 * A key of the 16-step sequencers (DRUM, BASS, SYNTH): cream, an LED on top that lights
 * with the node's colour (`.a`), lighter keys on the second and fourth beat (`.g`), an
 * outline on the step being played (`.ph`) and a dimmed look for a key that does nothing
 * right now (`.dim`; still tappable). Each sequencer sets its own sizes.
 */
export const stepKey = css`
  .st {
    position: relative;
    background: linear-gradient(#a9a598, #8f8b7e);
    border: 1px solid #2a2a33;
    border-radius: 3px;
    box-shadow: 0 2px 0 #0006;
  }
  /* Second and fourth beat: lighter keys. An active key keeps its cream colour; only its LED lights up. */
  .st.g {
    background: linear-gradient(#bfbbae, #a5a194);
  }
  .st::before {
    content: '';
    position: absolute;
    left: 22%;
    right: 22%;
    top: 2px;
    height: 3px;
    border-radius: 1px;
    background: #3c2a2a;
  }
  .st.a::before {
    background: var(--c);
    box-shadow: 0 0 6px var(--c);
  }
  .st.ph {
    outline: 2px solid #14141c;
    outline-offset: 1px;
  }
  .st.dim {
    opacity: 0.4;
  }
`;
