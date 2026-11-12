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
