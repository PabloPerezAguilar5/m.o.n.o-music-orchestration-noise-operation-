import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke tests of the real audio engine in Chromium.
 *
 * Playwright's Chromium does not enforce the autoplay policy (checked: an AudioContext
 * created without a gesture runs anyway). So an init script enforces the strictest rule
 * (Safari's) itself: a new AudioContext is suspended and only runs if resume() is called
 * while a user gesture is active. It also records every creation and resume() call.
 */

interface AudioLog {
  created: { active: boolean }[];
  resumed: { active: boolean }[];
}

declare global {
  interface Window {
    __audioLog: AudioLog;
    __mono: { level(): number };
  }
}

const recordAudio = () => {
  const log: AudioLog = { created: [], resumed: [] };
  window.__audioLog = log;
  // Inside the handler of a real touch or key press. (navigator.userActivation.isActive is
  // not enough: Chromium keeps it true for seconds after the gesture, so it would accept a
  // deferred call that Safari rejects.)
  const GESTURES = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchend', 'keydown', 'keyup'];
  const inGesture = (): boolean => {
    const event = (window as { event?: Event }).event;
    return event !== undefined && event.isTrusted && GESTURES.includes(event.type);
  };
  const Native = window.AudioContext;
  window.AudioContext = class extends Native {
    private allowed = false;
    constructor(options?: AudioContextOptions) {
      super(options);
      log.created.push({ active: inGesture() });
      void super.suspend();
    }
    override get state(): AudioContextState {
      return this.allowed ? super.state : 'suspended';
    }
    override resume(): Promise<void> {
      const active = inGesture();
      log.resumed.push({ active });
      if (!active) return Promise.resolve(); // blocked: stays suspended
      this.allowed = true;
      return super.resume();
    }
  };
};

/** Console errors and uncaught exceptions, minus what a test expects. */
function watchErrors(page: Page, expected: RegExp[] = []): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !expected.some((re) => re.test(message.text()))) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  return errors;
}

const audioState = (page: Page) => page.locator('mono-app').getAttribute('audio-state');

/** Highest master RMS over ~1.5 s (several bars of 909 at 120 bpm). */
async function peakLevel(page: Page): Promise<number> {
  let peak = 0;
  for (let i = 0; i < 30; i++) {
    peak = Math.max(peak, await page.evaluate(() => window.__mono.level()));
    await page.waitForTimeout(50);
  }
  return peak;
}

async function addDrum(page: Page): Promise<void> {
  await page.click('#add');
  await page.click('.chip[data-id="drum"]');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(recordAudio);
});

test('arranca, agrega DRUM, despierta el audio con el toque y suena sin errores', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');

  // Nothing audio-related before the first touch.
  expect(await audioState(page)).toBe('idle');
  expect(await page.evaluate(() => window.__audioLog.created.length)).toBe(0);

  await addDrum(page);
  await expect(page.locator('mono-app')).toHaveAttribute('audio-state', 'running');

  const log = await page.evaluate(() => window.__audioLog);
  expect(log.created).toEqual([{ active: true }]); // created inside the gesture
  expect(log.resumed[0]).toEqual({ active: true }); // and resumed inside it

  // The manifest arrives and the kit's samples play through the master.
  await expect(page.locator('#kit')).toBeEnabled();
  await expect(page.locator('#lcd')).toHaveText('DRUM · 909 · SEMILLA 4D4F4E4F');
  expect(await peakLevel(page)).toBeGreaterThan(0.01);

  // The playhead follows the audio clock and DRUM lights up on its hits.
  const column = () => page.locator('.st.ph').first().getAttribute('data-c');
  const first = await column();
  await expect.poll(column).not.toBe(first);
  await expect(page.locator('#nd-drum.on')).toHaveCount(1, { timeout: 2000 });

  expect(errors).toEqual([]);
});

test('el primer toque de play también despierta el audio', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.click('#play');
  await expect(page.locator('mono-app')).toHaveAttribute('audio-state', 'running');
  expect(await page.evaluate(() => window.__audioLog.created)).toEqual([{ active: true }]);
  expect(errors).toEqual([]);
});

test('detener silencia y quitar DRUM corta su cable sin errores', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await addDrum(page);
  await expect(page.locator('#kit')).toBeEnabled();
  expect(await peakLevel(page)).toBeGreaterThan(0.01);

  await page.click('#play'); // stop
  await page.waitForTimeout(3500); // let the longest tails ring out
  expect(await peakLevel(page)).toBeLessThan(0.001);

  await page.click('#play'); // play again
  expect(await peakLevel(page)).toBeGreaterThan(0.01);
  await page.click('#rm'); // remove DRUM: its cable is cut at the next bar
  await expect(page.locator('#nd-drum')).toHaveCount(0);
  await page.waitForTimeout(2500 + 3500); // next bar (2 s at 120 bpm) + tails
  expect(await peakLevel(page)).toBeLessThan(0.001);
  expect(errors).toEqual([]);
});

test('si falla un sample la app sigue: aviso en el display y respaldo sintético', async ({ page }) => {
  // The browser itself logs the 404 of the missing file; that one is expected.
  const errors = watchErrors(page, [/Failed to load resource.*404/]);
  await page.route('**/samples/drums/909samples/kick-1.wav', (route) => route.fulfill({ status: 404 }));
  await page.goto('/');
  await addDrum(page);

  await expect(page.locator('#lcd')).toHaveText('DRUM · FALTA kick-1.wav');
  await expect(page.locator('mono-app')).toHaveAttribute('audio-state', 'running');
  // Still playing: the other kicks and rows from samples, and sound comes out.
  expect(await peakLevel(page)).toBeGreaterThan(0.01);
  const column = () => page.locator('.st.ph').first().getAttribute('data-c');
  const first = await column();
  await expect.poll(column).not.toBe(first);
  expect(errors).toEqual([]);
});

test('sin manifiesto: todas las filas con voz sintética y aviso', async ({ page }) => {
  const errors = watchErrors(page, [/Failed to load resource.*404/]);
  await page.route('**/samples/drums/manifest.json', (route) => route.fulfill({ status: 404 }));
  await page.goto('/');
  await addDrum(page);
  await expect(page.locator('#lcd')).toHaveText('DRUM · FALTA manifest.json');
  await expect(page.locator('#kit')).toBeDisabled();
  expect(await peakLevel(page)).toBeGreaterThan(0.01); // the fallback voices
  expect(errors).toEqual([]);
});

test.describe('controles de DRUM', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await addDrum(page);
    await expect(page.locator('#kit')).toBeEnabled();
  });

  test('KIT recorre los kits del manifiesto', async ({ page }) => {
    const lcd = page.locator('#lcd');
    await expect(lcd).toContainText('· 909 ·');
    for (const label of ['FREAK', 'GLITCH', '808', 'TRIP', '909']) {
      await page.click('#kit');
      await expect(lcd).toContainText(`· ${label} ·`);
    }
  });

  test('DADO cambia la semilla y el patrón', async ({ page }) => {
    const lcd = page.locator('#lcd');
    const grid = () =>
      page.locator('mono-step-grid .st').evaluateAll((keys) => keys.map((k) => k.classList.contains('a')).join());
    const before = await grid();
    await page.click('#dice');
    await expect(lcd).not.toHaveText('DRUM · 909 · SEMILLA 4D4F4E4F');
    await expect(lcd).toHaveText(/^DRUM · 909 · SEMILLA [0-9A-F]{8}$/);
    expect(await grid()).not.toBe(before);
  });

  test('CAOS regenera el patrón con la misma semilla', async ({ page }) => {
    const grid = () =>
      page.locator('mono-step-grid .st').evaluateAll((keys) => keys.map((k) => k.classList.contains('a')).join());
    const before = await grid();
    const caos = page.locator('mono-knob[big] .kn');
    const box = (await caos.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 80, { steps: 6 }); // up: more chaos
    await page.mouse.up();
    expect(await grid()).not.toBe(before);
    await expect(page.locator('#lcd')).toHaveText(/^DRUM CAOS \d+$/);
    // Same seed: once the reading clears, the display still shows the initial one.
    await page.click('#nd-master');
    await page.click('#nd-drum');
    await expect(page.locator('#lcd')).toHaveText('DRUM · 909 · SEMILLA 4D4F4E4F');
  });

  test('las perillas de fila mueven tono y volumen y se leen en el display', async ({ page }) => {
    const vol = page.locator('section[data-section="snare"] mono-knob').nth(1).locator('.kn');
    const box = (await vol.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator('#lcd')).toHaveText('DRUM SNR VOL 0');
    await expect(vol).toHaveAttribute('aria-valuenow', '0');
  });
});
