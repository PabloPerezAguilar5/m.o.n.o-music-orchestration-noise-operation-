import { expect, test, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/**
 * Visual parity with the prototype. Both pages are walked through the same
 * states and their screenshots compared pixel by pixel. The port keeps the
 * prototype's ids and class names, so one set of selectors drives both.
 */

const PROTOTYPE_URL = '/reference/prototype/mono.html';

/**
 * Deliberate differences from the prototype, approved after stage 1. They are
 * applied to the prototype page before its screenshots, so the comparison still
 * covers everything else in the states they touch. Style-only ones go in
 * APPROVED_DEVIATIONS; ones that change markup go in PROTOTYPE_PATCHES.
 */
const APPROVED_DEVIATIONS = `
  /* 1. Active sequencer steps: only the LED takes the node colour, on every beat.
        The prototype also paints the whole key on beats 1 and 3, a leftover of its
        first style layer that breaks the rule "node colour only on frame, headers,
        LEDs and display". Affects panel-synth, panel-drum and panel-bass. */
  .st.a { background: linear-gradient(#a9a598, #8f8b7e); }
  .st.a.g { background: linear-gradient(#bfbbae, #a5a194); }

  /* 2. The "tocá + para agregar un nodo" hint hides while the add menu is open.
        In the prototype it showed through between the chips. Affects menu-open. */
  #stage:has(#menu .chip) #hint { display: none !important; }
`;

/**
 * 3. The LEAD keyboard starts on C instead of E: white keys C D E F G A B C D E,
 *    black keys between C-D, D-E, F-G, G-A and A-B. Requested before stage 2.
 *    The prototype's keys are rebuilt with its own markup (black key centred on
 *    the edge of white key i: left = (i + 1) * 10%). Affects panel-lead.
 */
const LEAD_FROM_C = {
  white: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E'],
  blackAfter: [0, 1, 3, 4, 5, 7, 8],
};

/** Applied to the prototype right before the screenshot of the named state. */
const PROTOTYPE_PATCHES: Readonly<Record<string, (page: Page) => Promise<void>>> = {
  'panel-lead': (page) =>
    page.evaluate(({ white, blackAfter }) => {
      const keys = document.querySelector('.keys');
      if (!keys) throw new Error('prototype keyboard not found');
      keys.innerHTML =
        white.map((label) => `<div class="wk">${label}</div>`).join('') +
        blackAfter.map((i) => `<div class="bk" style="left:${(i + 1) * 10}%"></div>`).join('');
    }, LEAD_FROM_C),
};
/**
 * 5. MASTER panel: a CLICK section (metronome on/off key with LED, VOL knob) sits
 *    between the MASTER knobs and MACRO. Requested after stage 2. The prototype has
 *    no metronome, so the section is hidden (visibility, not display: it keeps its
 *    place) in the app's screenshots; the rest of the MASTER panel is still compared.
 *    Affects initial and panel-master-all-nodes.
 */
const hideMetronome = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const root = document.querySelector('mono-app')?.shadowRoot?.querySelector('mono-panel')?.shadowRoot;
    if (!root?.querySelector('section[data-section="metronome"]')) throw new Error('CLICK section not found');
    const style = document.createElement('style');
    style.textContent = 'section[data-section="metronome"] { visibility: hidden; }';
    root.append(style);
  });

/** Applied to the app right before the screenshot of the named state. */
const APP_PATCHES: Readonly<Record<string, (page: Page) => Promise<void>>> = {
  initial: hideMetronome,
  'panel-master-all-nodes': hideMetronome,
};

/**
 * States no longer compared, and why. Still walked through, so the rest of the
 * sequence stays the same.
 *
 * 4. panel-drum (stage 2): DRUM became a real instrument. Its knobs are now TONO and
 *    VOL per row (KCK, SNR, HAT, PRC). After stage 2 the header changed again on
 *    request: a PATRÓN section with RNDM (was DADO), a KIT section with one key per
 *    kit (808, FREAK, GLITCH, TRIP, ACID, HOUSE, LAB, LINNROCK; two rows of four
 *    on narrow screens) and an LED on the active one (was a single KIT key that
 *    cycled), and the display shows only the kit (the seed is no longer shown
 *    anywhere). The prototype has no equivalent to patch in.
 */
/*
 * 6. panel-bass (stage 3): BASS became a real 303-style instrument. The prototype's
 *    three rows (NOTA, SLD, ACC) became seven: one per note of the key (named after
 *    it, highest on top), then SLD and ACC, because each step now holds a note. The
 *    header gained OSC (wave, SUB), ESCALA (tonic and scale), MODO (five modes with
 *    LEDs) and PATRÓN (DICE), and the display shows the key. No prototype equivalent.
 *    Cables also gained an invisible, wide tap target (to cut and plug them back); it
 *    draws nothing, so every other state is still compared.
 *    After stage 4, on request: a gap separates the five note rows from the rows that
 *    modify them, now captioned SLIDE and ACCENT in full (the caption column widens to
 *    fit them); SLIDE and ACCENT keys are dimmed on steps without a note; PATRÓN gained
 *    a SLIDE ON/OFF key with an LED, and with slides off the whole SLIDE row is dimmed
 *    (the marks stay).
 */
/*
 * 7. panel-synth (stage 4): SYNTH became a real polyphonic instrument. The prototype's
 *    three rows (NOTA, OCT, ACC) became eleven: one per note of two octaves of the key
 *    (named with their octave, highest on top), so a step can hold a chord, and DUR,
 *    with each step's length written on its key. The header gained SONIDO (PLUCK, PAD,
 *    STAB, GLASS), ESCALA (shared with BASS), MODO (four DICE styles) and PATRÓN (DICE),
 *    and the display shows sound and key. The knobs start where PLUCK sounds right
 *    (ONDA keeps its prototype position). No prototype equivalent.
 *    After stage 4, the same criteria as BASS: a gap separates the ten note rows from
 *    the length row, captioned DURACIÓN in full, and its keys are dimmed on steps
 *    without notes. SYNTH has no slides, so it has no SLIDE ON/OFF key.
 */
/*
 * 8. After stage 4, on request: PATRÓN gained a BORRAR key on DRUM, BASS and SYNTH that
 *    leaves the node's pattern blank. On DRUM it is stacked under RNDM, so the knob row
 *    still fits at 1280 px with the eight kit keys. Affects panel-drum, panel-bass and
 *    panel-synth, already excluded above. The space bar now plays and stops; it draws
 *    nothing.
 */
const EXCLUDED_STATES: Readonly<Record<string, string>> = {
  'panel-drum': 'DRUM panel redesigned in stage 2 and after',
  'panel-bass': 'BASS panel redesigned in stage 3',
  'panel-synth': 'SYNTH panel redesigned in stage 4',
};

const NODE_ORDER = ['synth', 'drum', 'bass', 'drone', 'dist', 'lfo', 'lead'] as const;
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const;

/**
 * pixelmatch colour tolerance. 0.03 flags a pixel once it is off by about 8/255.
 * Glow edges are not rasterised identically from one load to the next (a few
 * dozen pixels move by up to 4/255, now and then one by a little more), so a
 * handful of flagged pixels is allowed. A real difference, such as a border
 * one pixel off or a wrong colour, flags hundreds.
 */
const COLOR_THRESHOLD = 0.03;
const MAX_DIFF_PIXELS = 20;

/** Wait until nothing is lit or moving, then for the CSS transitions to finish. */
async function settle(page: Page): Promise<void> {
  await expect(page.locator('.nd.on, .cb.on, .st.ph')).toHaveCount(0);
  await page.waitForTimeout(400);
}

/** Walks the page through every state worth comparing and returns a screenshot of each. */
async function walk(page: Page, url: string): Promise<Map<string, Buffer>> {
  const shots = new Map<string, Buffer>();
  const shoot = async (name: string): Promise<void> => {
    if (url === PROTOTYPE_URL) await PROTOTYPE_PATCHES[name]?.(page);
    else await APP_PATCHES[name]?.(page);
    await settle(page);
    shots.set(name, await page.screenshot());
  };

  await page.goto(url);
  if (url === PROTOTYPE_URL) await page.addStyleTag({ content: APPROVED_DEVIATIONS });
  await shoot('initial');

  await page.click('#add');
  await shoot('menu-open');
  await page.click('#add');

  for (const id of NODE_ORDER) {
    await page.click('#add');
    await page.click(`.chip[data-id="${id}"]`);
    await page.click('#play'); // adding a node starts playback; stop it for a still frame
    await shoot(`panel-${id}`);
  }

  await page.click('#nd-master');
  await shoot('panel-master-all-nodes');
  return shots;
}

for (const viewport of VIEWPORTS) {
  test(`looks like the prototype (${viewport.name})`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
    });
    const prototype = await walk(await context.newPage(), PROTOTYPE_URL);
    const app = await walk(await context.newPage(), '/');
    await context.close();

    expect([...app.keys()]).toEqual([...prototype.keys()]);
    for (const [name, expectedShot] of prototype) {
      if (name in EXCLUDED_STATES) continue;
      const expected = PNG.sync.read(expectedShot);
      const actual = PNG.sync.read(app.get(name)!);
      const diff = new PNG({ width: expected.width, height: expected.height });
      const differing = pixelmatch(
        expected.data,
        actual.data,
        diff.data,
        expected.width,
        expected.height,
        { threshold: COLOR_THRESHOLD },
      );
      if (differing > MAX_DIFF_PIXELS) {
        await testInfo.attach(`${name}-prototype.png`, {
          body: expectedShot,
          contentType: 'image/png',
        });
        await testInfo.attach(`${name}-app.png`, {
          body: app.get(name)!,
          contentType: 'image/png',
        });
        await testInfo.attach(`${name}-diff.png`, {
          body: PNG.sync.write(diff),
          contentType: 'image/png',
        });
      }
      expect.soft(differing, `${name}: pixels that differ from the prototype`).toBeLessThanOrEqual(
        MAX_DIFF_PIXELS,
      );
    }
  });
}
