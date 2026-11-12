import { css } from 'lit';

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
