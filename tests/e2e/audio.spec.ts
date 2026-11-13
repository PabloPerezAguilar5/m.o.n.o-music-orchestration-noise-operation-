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
    __mono: {
      level(): number;
      mix(): { bus: number; out: number; reduction: number };
      clickLevel(): number;
      store: {
        getState(): { drum: { seed: number } };
        setParam(id: string, param: string, value: number): void;
      };
      /** LEAD and DRONE played by hand: a test finger, like the panel's. */
      live: {
        keyDown(touch: number, semitone: number): void;
        keyUp(touch: number): void;
        padDown(touch: number, point: { x: number; y: number }): void;
        padUp(touch: number): void;
      };
    };
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

/** Highest master RMS over ~1.5 s (several bars of 808 at 120 bpm). */
async function peakLevel(page: Page): Promise<number> {
  let peak = 0;
  for (let i = 0; i < 30; i++) {
    peak = Math.max(peak, await page.evaluate(() => window.__mono.level()));
    await page.waitForTimeout(50);
  }
  return peak;
}

const KIT_808 = '[data-kit="samples808"]';

/** Grid steps lit, as one string, to tell patterns apart. */
const gridOf = (page: Page) =>
  page.locator('mono-step-grid .st').evaluateAll((keys) => keys.map((k) => (k.classList.contains('a') ? 1 : 0)).join(''));

/** Waits until the master has been silent for a while (tails rung out). */
async function waitSilence(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__mono.level()), { timeout: 6000, intervals: [200] })
    .toBeLessThan(0.001);
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
  await expect(page.locator(KIT_808)).toBeEnabled();
  await expect(page.locator('#lcd')).toHaveText('DRUM · 808');
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
  await expect(page.locator(KIT_808)).toBeEnabled();
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
  await page.route('**/samples/drums/samples808/kick-long.wav', (route) => route.fulfill({ status: 404 }));
  await page.goto('/');
  await addDrum(page);

  await expect(page.locator('#lcd')).toHaveText('DRUM · FALTA kick-long.wav');
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
  await expect(page.locator('[data-kit]')).toHaveCount(8);
  for (const key of await page.locator('[data-kit]').all()) await expect(key).toBeDisabled();
  expect(await peakLevel(page)).toBeGreaterThan(0.01); // the fallback voices
  expect(errors).toEqual([]);
});

test.describe('controles de DRUM', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await addDrum(page);
    await expect(page.locator(KIT_808)).toBeEnabled();
  });

  test('KIT: una tecla por kit, siempre a la vista, LED en el activo', async ({ page }) => {
    const keys = page.locator('[data-kit]');
    await expect(keys).toHaveText(['808', 'FREAK', 'GLITCH', 'TRIP', 'ACID', 'HOUSE', 'LAB', 'LINNROCK']);
    for (const key of await keys.all()) await expect(key).toBeVisible();
    await expect(page.locator('[data-kit].on')).toHaveAttribute('data-kit', 'samples808');

    for (const [id, label] of [
      ['freaksamples', 'FREAK'],
      ['glitch', 'GLITCH'],
      ['trip', 'TRIP'],
      ['acid', 'ACID'],
      ['house', 'HOUSE'],
      ['lab', 'LAB'],
      ['linnrock', 'LINNROCK'],
      ['samples808', '808'],
    ] as const) {
      await page.click(`[data-kit="${id}"]`);
      await expect(page.locator('#lcd')).toHaveText(`DRUM · ${label}`);
      await expect(page.locator('[data-kit].on')).toHaveCount(1);
      await expect(page.locator('[data-kit].on')).toHaveAttribute('data-kit', id);
      await expect(page.locator(`[data-kit="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('KIT: tocar un kit con todo detenido hace sonar su kick', async ({ page }) => {
    await page.click('#play'); // stop
    await waitSilence(page);
    await page.click('[data-kit="trip"]');
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    await waitSilence(page); // one hit only: the pattern does not start
  });

  // Bug fixed: at the starting CAOS every seed gave the same pattern, so after the
  // first press the key did nothing.
  test('RNDM genera un patrón nuevo en cada toque', async ({ page }) => {
    await expect(page.locator('#rndm')).toHaveText('RNDM');
    let previous = await gridOf(page);
    for (let press = 0; press < 4; press++) {
      await page.click('#rndm');
      const next = await gridOf(page);
      expect(next, `press ${press + 1}`).not.toBe(previous);
      previous = next;
    }
    await expect(page.locator('#lcd')).toHaveText('DRUM · 808');
  });

  test('CAOS regenera el patrón con la misma semilla', async ({ page }) => {
    const grid = () => gridOf(page);
    const before = await grid();
    const caos = page.locator('mono-knob[big] .kn');
    const box = (await caos.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 80, { steps: 6 }); // up: more chaos
    await page.mouse.up();
    expect(await grid()).not.toBe(before);
    await expect(page.locator('#lcd')).toHaveText(/^DRUM CAOS \d+$/);
    // Same seed, which stays internal: once the reading clears, the display shows the kit.
    expect(await page.evaluate(() => window.__mono.store.getState().drum.seed)).toBe(0x4d4f4e4f);
    await page.click('#nd-master');
    await page.click('#nd-drum');
    await expect(page.locator('#lcd')).toHaveText('DRUM · 808');
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

/** Highest value of a probe over `ms`, sampled every 5 ms inside the page (clicks are short). */
const peakOf = (page: Page, probe: 'level' | 'clickLevel', ms = 1500): Promise<number> =>
  page.evaluate(
    ([name, duration]) =>
      new Promise<number>((resolve) => {
        let peak = 0;
        const timer = setInterval(() => (peak = Math.max(peak, window.__mono[name]())), 5);
        setTimeout(() => {
          clearInterval(timer);
          resolve(peak);
        }, duration);
      }),
    [probe, ms] as const,
  );

test.describe('metrónomo del MASTER', () => {
  test('CLICK suena en cada tiempo, directo a la salida, con LED y volumen', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await page.click('#play'); // only MASTER on the canvas: nothing else makes sound
    await expect(page.locator('mono-app')).toHaveAttribute('audio-state', 'running');

    const click = page.locator('#click');
    await expect(click).toHaveText('CLICK');
    await expect(click).toHaveAttribute('aria-pressed', 'false');
    expect(await peakOf(page, 'clickLevel', 1100)).toBe(0);

    await click.click();
    await expect(click).toHaveAttribute('aria-pressed', 'true');
    // The LED flashes with the pulses (stronger on beat 1) and goes dark in between.
    await expect(page.locator('#click.on')).toHaveCount(1, { timeout: 2000 });
    await expect(page.locator('#click:not(.on)')).toHaveCount(1, { timeout: 2000 });
    // Beat 1 lasts one step (125 ms) per bar: sampled inside the page, every 10 ms, over a bar and a half.
    const seen = await page.evaluate(
      () =>
        new Promise<{ accent: number; beat: number }>((resolve) => {
          const key = () =>
            document.querySelector('mono-app')?.shadowRoot?.querySelector('mono-panel')?.shadowRoot?.querySelector('#click');
          const seen = { accent: 0, beat: 0 };
          const timer = setInterval(() => {
            const classes = key()?.classList;
            if (classes?.contains('acc')) seen.accent++;
            else if (classes?.contains('on')) seen.beat++;
          }, 10);
          setTimeout(() => {
            clearInterval(timer);
            resolve(seen);
          }, 3000);
        }),
    );
    expect(seen.accent).toBeGreaterThan(0);
    expect(seen.beat).toBeGreaterThan(0);

    // It sounds, and not through the master (whose meter stays silent).
    expect(await peakOf(page, 'clickLevel')).toBeGreaterThan(0.05);
    expect(await peakOf(page, 'level')).toBeLessThan(0.001);

    // VOL to zero silences it, and the display reads the knob.
    const vol = page.locator('section[data-section="metronome"] mono-knob .kn');
    const box = (await vol.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator('#lcd')).toHaveText('MASTER CLICK VOL 0');
    await page.waitForTimeout(200);
    expect(await peakOf(page, 'clickLevel', 1100)).toBeLessThan(0.0005);

    // Off: the LED stays dark.
    await click.click();
    await expect(click).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(1100);
    await expect(page.locator('#click.on')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('CLICK sigue sonando con DRUM y al quitar todos los nodos', async ({ page }) => {
    await page.goto('/');
    await page.click('#click');
    await addDrum(page);
    await expect(page.locator(KIT_808)).toBeEnabled();
    expect(await peakOf(page, 'clickLevel')).toBeGreaterThan(0.05);
    await page.click('#rm');
    expect(await peakOf(page, 'clickLevel')).toBeGreaterThan(0.05);
  });
});

test('la palabra semilla no aparece en la interfaz', async ({ page }) => {
  await page.goto('/');
  await addDrum(page);
  await expect(page.locator(KIT_808)).toBeEnabled();
  await page.click('#rndm');
  const texts = await page.evaluate(() => {
    const out: string[] = [];
    const walk = (root: Document | ShadowRoot): void => {
      for (const el of root.querySelectorAll('*')) {
        if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') continue;
        for (const attr of ['aria-label', 'title', 'placeholder']) {
          const value = el.getAttribute(attr);
          if (value) out.push(value);
        }
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) out.push(node.textContent.trim());
        }
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document);
    return out.join(' | ');
  });
  expect(texts).toContain('RNDM');
  expect(texts).not.toMatch(/semilla|seed/i);
});

/** Clicks the middle of a node's cable (its tap target is an invisible wide line). */
async function clickCable(page: Page, id: string): Promise<void> {
  const box = await page.locator(`#cb-${id}`).evaluate((line) => {
    const r = line.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
}

/** The space above grid row `row` is clearly wider than between the rows above it. */
async function expectGapBefore(page: Page, row: number): Promise<void> {
  const top = async (r: number) => (await page.locator(`.st[data-r="${r}"][data-c="0"]`).boundingBox())!;
  const above = await top(row - 1);
  const twoAbove = await top(row - 2);
  const at = await top(row);
  const normal = above.y - (twoAbove.y + twoAbove.height);
  const gap = at.y - (above.y + above.height);
  expect(gap, `gap above row ${row}`).toBeGreaterThanOrEqual(normal + 5);
}

async function addBass(page: Page): Promise<void> {
  await page.click('#add');
  await page.click('.chip[data-id="bass"]');
}

test.describe('BASS', () => {
  test('suena con su voz 303, se enciende con el reloj y el cable se corta y reconecta en vivo', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await addBass(page);
    await expect(page.locator('mono-app')).toHaveAttribute('audio-state', 'running');

    // Sound through the master, the playhead moving and the node lighting up on its notes.
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    const column = () => page.locator('.st.ph').first().getAttribute('data-c');
    const first = await column();
    await expect.poll(column).not.toBe(first);
    await expect(page.locator('#nd-bass.on')).toHaveCount(1, { timeout: 2000 });

    // Cut the cable: drawn as cut at once, silent from the next bar.
    await clickCable(page, 'bass');
    await expect(page.locator('#cb-bass')).toHaveClass(/\boff\b/);
    await page.waitForTimeout(2300); // up to one bar at 120 bpm, plus the release
    expect(await peakLevel(page)).toBeLessThan(0.001);
    await expect(page.locator('#nd-bass.on')).toHaveCount(0);

    // Plug it back: sound again from the next bar, without stopping playback.
    await clickCable(page, 'bass');
    await expect(page.locator('#cb-bass')).not.toHaveClass(/\boff\b/);
    await page.waitForTimeout(2100);
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    await expect(page.locator('#play')).toHaveClass(/on/);
    expect(errors).toEqual([]);
  });

  test('panel: DICE, modos, tónica, escala, onda, sub y pasos', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await addBass(page);
    const lcd = page.locator('#lcd');
    await expect(lcd).toHaveText('BASS · C PENTA MENOR');
    await expect(page.locator('mono-step-grid .st')).toHaveCount(7 * 16);

    // DICE: a new pattern each time.
    let previous = await gridOf(page);
    for (let press = 0; press < 3; press++) {
      await page.click('#dice');
      const next = await gridOf(page);
      expect(next, `press ${press + 1}`).not.toBe(previous);
      previous = next;
    }

    // Modes: one LED on; a mode changes the pattern.
    await expect(page.locator('[data-mode]')).toHaveText(['PULSE', 'BROKEN', 'DIRTY', 'DRONE', 'CHAOS']);
    await expect(page.locator('[data-mode].on')).toHaveAttribute('data-mode', 'pulse');
    await page.click('[data-mode="drone"]');
    await expect(page.locator('[data-mode].on')).toHaveAttribute('data-mode', 'drone');
    await expect(lcd).toHaveText('BASS MODO DRONE');

    // Key: tonic and scale step, and the note rows follow.
    await page.click('[data-root="1"]');
    await expect(page.locator('#root')).toHaveText('C#');
    await expect(lcd).toHaveText('BASS TÓNICA C#');
    await page.click('[data-scale="1"]');
    await expect(page.locator('#scale')).toHaveText('MENOR');
    const captions = await page.locator('mono-step-grid .sq > span:not(.nm)').allTextContents();
    // C# minor: C# Eb E Ab B (spelled as fck-synth does), highest on top.
    expect(captions.filter(Boolean)).toEqual(['B', 'Ab', 'E', 'Eb', 'C#', 'SLIDE', 'ACCENT']);

    // A gap sets SLIDE and ACCENT apart from the notes.
    await expectGapBefore(page, 5);

    // SLIDE and ACCENT dim on steps without a note: step 2 is a rest in DRONE (notes on 1 and 9).
    await page.click('[data-mode="drone"]');
    await expect(page.locator('.st[data-r="5"][data-c="1"]')).toHaveClass(/\bdim\b/);
    await expect(page.locator('.st[data-r="6"][data-c="1"]')).toHaveClass(/\bdim\b/);
    await expect(page.locator('.st[data-r="6"][data-c="0"]')).not.toHaveClass(/\bdim\b/);

    // SLIDE ON/OFF: off dims the whole SLIDE row and keeps the marks.
    const slides = page.locator('#slides');
    await expect(slides).toHaveText('SLIDE');
    await expect(slides).toHaveAttribute('aria-pressed', 'true');
    const marks = await page.locator('.st[data-r="5"].a').count();
    await slides.click();
    await expect(slides).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.st[data-r="5"].dim')).toHaveCount(16);
    await expect(page.locator('.st[data-r="5"].a')).toHaveCount(marks);
    await slides.click();
    await expect(page.locator('.st[data-r="5"][data-c="0"]')).not.toHaveClass(/\bdim\b/);

    // Wave and sub.
    await expect(page.locator('#wave')).toHaveText('SIERRA');
    await page.click('#wave');
    await expect(page.locator('#wave')).toHaveText('CUADRADA');
    await page.click('#sub');
    await expect(page.locator('#sub')).toHaveAttribute('aria-pressed', 'true');

    // A note step: tap a degree, then tap it again for a rest.
    const cell = page.locator('.st[data-r="0"][data-c="1"]');
    await cell.click();
    await expect(cell).toHaveClass(/\ba\b/);
    await cell.click();
    await expect(cell).not.toHaveClass(/\ba\b/);

    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    expect(errors).toEqual([]);
  });
});

async function addNode(page: Page, id: string): Promise<void> {
  await page.click('#add');
  await page.click(`.chip[data-id="${id}"]`);
}

test.describe('SYNTH', () => {
  test('suena con acordes, se enciende con el reloj y el cable se corta y reconecta en vivo', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await addNode(page, 'synth');
    await expect(page.locator('mono-app')).toHaveAttribute('audio-state', 'running');

    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    const column = () => page.locator('.st.ph').first().getAttribute('data-c');
    const first = await column();
    await expect.poll(column).not.toBe(first);
    await expect(page.locator('#nd-synth.on')).toHaveCount(1, { timeout: 2000 });

    await clickCable(page, 'synth');
    await expect(page.locator('#cb-synth')).toHaveClass(/\boff\b/);
    await page.waitForTimeout(2600); // up to one bar at 120 bpm, plus the release of a PLUCK
    expect(await peakLevel(page)).toBeLessThan(0.001);

    await clickCable(page, 'synth');
    await page.waitForTimeout(2100);
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    expect(errors).toEqual([]);
  });

  test('panel: sonidos, modos, DICE, acordes, duración y la tonalidad compartida con el BASS', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await addNode(page, 'synth');
    const lcd = page.locator('#lcd');
    await expect(lcd).toHaveText('SYNTH · PLUCK · C PENTA MENOR');
    await expect(page.locator('mono-step-grid .st')).toHaveCount(11 * 16);
    await expect(page.locator('mono-knob')).toHaveCount(7); // ONDA CUTOFF RESO ATAQUE RELEASE DETUNE + CAOS

    // Sounds: one LED on.
    await expect(page.locator('[data-preset]')).toHaveText(['PLUCK', 'PAD', 'STAB', 'GLASS']);
    await page.click('[data-preset="pad"]');
    await expect(page.locator('[data-preset].on')).toHaveAttribute('data-preset', 'pad');
    await expect(lcd).toHaveText('SYNTH SONIDO PAD');

    // DICE modes and DICE: a new pattern each time.
    await expect(page.locator('[data-mode]')).toHaveText(['ARPEGIO', 'ACORDES', 'MELODÍA', 'AMBIENTE']);
    await page.click('[data-mode="arp"]');
    await expect(page.locator('[data-mode].on')).toHaveAttribute('data-mode', 'arp');
    let previous = await gridOf(page);
    for (let press = 0; press < 3; press++) {
      await page.click('#dice');
      const next = await gridOf(page);
      expect(next, `press ${press + 1}`).not.toBe(previous);
      previous = next;
    }

    // A chord on step 2 (empty in AMBIENTE, whose chords fall on steps 1, 5, 9 and 13): three notes, then DUR.
    await page.click('[data-mode="ambient"]');
    for (const row of [9, 7, 5]) await expect(page.locator(`.st[data-r="${row}"][data-c="1"]`)).not.toHaveClass(/\ba\b/);
    for (const row of [9, 7, 5]) await page.click(`.st[data-r="${row}"][data-c="1"]`);
    for (const row of [9, 7, 5]) await expect(page.locator(`.st[data-r="${row}"][data-c="1"]`)).toHaveClass(/\ba\b/);
    const dur = page.locator('.st[data-r="10"][data-c="1"]');
    await expect(dur).toHaveText('1');
    await expect(dur).not.toHaveClass(/\bdim\b/);
    await dur.click();
    await expect(dur).toHaveText('2');
    // DURACIÓN is set apart from the notes and dims on steps without notes (step 3 here).
    await expectGapBefore(page, 10);
    await expect(page.locator('.st[data-r="10"][data-c="2"]')).toHaveClass(/\bdim\b/);

    // Rows named after the key over two octaves; the key is shared with BASS.
    const captions = await page.locator('mono-step-grid .sq > span:not(.nm)').allTextContents();
    expect(captions.filter(Boolean)).toEqual(['Bb4', 'G4', 'F4', 'Eb4', 'C4', 'Bb3', 'G3', 'F3', 'Eb3', 'C3', 'DURACIÓN']);
    await page.click('[data-root="1"]');
    await addNode(page, 'bass');
    await expect(page.locator('#root')).toHaveText('C#');
    await expect(lcd).toHaveText('BASS · C# PENTA MENOR');

    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    expect(errors).toEqual([]);
  });
});

test.describe('mezcla', () => {
  /** Highest peaks before and after the master's limiter, and its deepest reduction, over `ms`. */
  const mixOver = (page: Page, ms: number) =>
    page.evaluate(
      (duration) =>
        new Promise<{ bus: number; out: number; reduction: number }>((resolve) => {
          let bus = 0;
          let out = 0;
          let reduction = 0;
          const timer = setInterval(() => {
            const m = window.__mono.mix();
            bus = Math.max(bus, m.bus);
            out = Math.max(out, m.out);
            reduction = Math.min(reduction, m.reduction);
          }, 15);
          setTimeout(() => {
            clearInterval(timer);
            resolve({ bus, out, reduction });
          }, duration);
        }),
      ms,
    );

  test('DRUM, BASS y SYNTH juntos no pasan de 0 dBFS ni hacen trabajar de más al limitador', async ({ page }) => {
    await page.goto('/');
    for (const id of ['drum', 'bass', 'synth']) await addNode(page, id);
    await page.waitForTimeout(2500); // every module joins at a bar line
    const defaults = await mixOver(page, 6000);
    // The sum itself stays under full scale; the limiter only shaves a little.
    expect(defaults.bus).toBeGreaterThan(0.2);
    expect(defaults.bus).toBeLessThan(1);
    expect(defaults.out).toBeLessThan(1);
    expect(defaults.reduction).toBeGreaterThan(-3);

    // The loudest SYNTH sound (STAB: sustained, driven chords) stays under full scale too.
    await page.click('#nd-synth');
    await page.click('[data-preset="stab"]');
    await page.click('[data-mode="chords"]');
    await page.waitForTimeout(2200);
    const stab = await mixOver(page, 4000);
    expect(stab.bus).toBeLessThan(1);
    expect(stab.reduction).toBeGreaterThan(-3);

    // Every MASTER level and VOL at full: the limiter and the soft clip still keep it under 0 dBFS.
    for (const param of ['drumLevel', 'bassLevel', 'synthLevel', 'volume']) {
      await page.evaluate((p) => window.__mono.store.setParam('master', p, 1), param);
    }
    const loud = await mixOver(page, 4000);
    expect(loud.bus).toBeGreaterThan(defaults.bus);
    expect(loud.out).toBeLessThan(1);
  });
});

test.describe('BORRAR', () => {
  test('deja en blanco el patrón de DRUM, BASS y SYNTH, y el nodo se calla', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    for (const id of ['drum', 'bass', 'synth']) {
      await addNode(page, id);
      await expect(page.locator('mono-step-grid .st.a').first()).toBeVisible();
      await expect(page.locator('#clear')).toHaveText('BORRAR');
      await page.click('#clear');
      await expect(page.locator('mono-step-grid .st.a')).toHaveCount(0);
    }
    // Every pattern blank: once the tails ring out, silence.
    await waitSilence(page);
    // DICE fills it again.
    await page.click('#dice');
    await expect(page.locator('mono-step-grid .st.a').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

/** Waits until the master is silent: release and effect tails rung out (DRONE's reverb is long). */
async function waitQuiet(page: Page, timeout = 10_000, step = 'silencio'): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__mono.level()), { timeout, intervals: [100], message: step })
    .toBeLessThan(0.001);
}

/** Presses a LEAD key with the mouse and keeps it down. */
async function holdKey(page: Page, index: number): Promise<void> {
  const box = (await page.locator('mono-keys .wk').nth(index).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8);
  await page.mouse.down();
}

test.describe('LEAD', () => {
  test('suena mientras se toca, también detenido, y el cable se corta y reconecta en el acto', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await addNode(page, 'lead');
    await expect(page.locator('mono-app')).toHaveAttribute('audio-state', 'running');
    await page.click('#play'); // stopped: LEAD is played by hand, it does not need the transport

    await holdKey(page, 4);
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    await expect(page.locator('#nd-lead')).toHaveClass(/\bon\b/);
    await page.mouse.up();
    await waitQuiet(page);
    await expect(page.locator('#nd-lead')).not.toHaveClass(/\bon\b/);

    // A finger held down, then the cable cut: silent at once, the note released.
    await page.evaluate(() => window.__mono.live.keyDown(1, 0));
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    await clickCable(page, 'lead');
    await expect(page.locator('#cb-lead')).toHaveClass(/\boff\b/);
    await waitQuiet(page, 2000, 'cable cortado');
    await expect(page.locator('#nd-lead')).not.toHaveClass(/\bon\b/);
    // Plugged back, nothing comes back by itself: the note was released, not muted.
    await clickCable(page, 'lead');
    await expect(page.locator('#cb-lead')).not.toHaveClass(/\boff\b/);
    expect(await peakLevel(page), 'cable reconectado').toBeLessThan(0.001);
    // And the keys play again.
    await holdKey(page, 7);
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    await page.mouse.up();
    expect(errors).toEqual([]);
  });

  test('parar el transporte o quitar el nodo suelta la nota que suena', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await addNode(page, 'lead');
    await expect(page.locator('#play')).toHaveClass(/on/);

    await page.evaluate(() => window.__mono.live.keyDown(1, 0));
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    await page.click('#play');
    await waitQuiet(page, 2000);

    await page.click('#play');
    await page.evaluate(() => window.__mono.live.keyDown(2, 5));
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    await page.click('#rm');
    await waitQuiet(page, 2000);
    await expect(page.locator('#nd-lead')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('HOLD deja sonar la nota al soltar la tecla; apagarlo la suelta', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await addNode(page, 'lead');
    await expect(page.locator('mono-app')).toHaveAttribute('audio-state', 'running');
    await page.click('#play'); // stopped: only the held note sounds
    await page.click('#hold');

    await holdKey(page, 4);
    await page.mouse.up();
    await page.waitForTimeout(1500); // well past the default release
    expect(await peakLevel(page), 'nota sostenida').toBeGreaterThan(0.01);
    await page.click('#hold');
    await waitQuiet(page, 5000, 'HOLD apagado');
    expect(errors).toEqual([]);
  });

  test('OCT y SCALE LOCK cambian lo que toca cada tecla; la escala es la compartida', async ({ page }) => {
    await page.goto('/');
    await addNode(page, 'lead');
    await expect(page.locator('#octave')).toHaveText('OCT C4');
    await page.click('#oct-down');
    await expect(page.locator('#octave')).toHaveText('OCT C3');
    await expect(page.locator('mono-keys .wk').first()).toHaveText('C3');
    await page.click('#lock');
    await expect(page.locator('mono-keys .wk.out').first()).toBeVisible();
    // ESCALA is shared: changing the tonic here changes it for BASS and SYNTH.
    await page.click('[data-root="1"]');
    await expect(page.locator('#root')).toHaveText('C#');
    await page.click('#nd-master');
    await page.click('#nd-lead');
    await expect(page.locator('#lcd')).toHaveText('LEAD · C3-C5 · C# PENTA MENOR');
    await addNode(page, 'bass');
    await expect(page.locator('#lcd')).toHaveText('BASS · C# PENTA MENOR');
  });
});

test.describe('DRONE', () => {
  test('TOUCH suena mientras se toca; HOLD sigue al soltar; STOP y CLEAR callan; hasta seis capas', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = watchErrors(page);
    await page.goto('/');
    await addNode(page, 'drone');
    await expect(page.locator('mono-app')).toHaveAttribute('audio-state', 'running');
    const pad = page.locator('.xy');
    const box = (await pad.boundingBox())!;

    // TOUCH: sounds while the finger is down, the node lit; silent after it lifts.
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await page.mouse.down();
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    await expect(page.locator('#nd-drone')).toHaveClass(/\bon\b/);
    await expect(page.locator('#layers')).toHaveText('CAPAS 1/6');
    await page.mouse.up();
    await expect(page.locator('#layers')).toHaveText('CAPAS 0/6');
    await waitQuiet(page);
    await expect(page.locator('#nd-drone')).not.toHaveClass(/\bon\b/);

    // HOLD: the layers stay after the fingers lift, until STOP.
    await page.click('[data-mode="hold"]');
    await pad.click({ position: { x: box.width * 0.2, y: box.height * 0.5 } });
    await pad.click({ position: { x: box.width * 0.7, y: box.height * 0.2 } });
    await expect(page.locator('#layers')).toHaveText('CAPAS 2/6');
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    await page.click('#stop');
    await expect(page.locator('#layers')).toHaveText('CAPAS 0/6');
    await waitQuiet(page);

    // Six at most: a seventh takes the place of the oldest.
    for (let i = 0; i < 7; i++) {
      await pad.click({ position: { x: box.width * (0.1 + i * 0.12), y: box.height * 0.5 } });
    }
    await expect(page.locator('#layers')).toHaveText('CAPAS 6/6');
    await expect(pad.locator('b')).toHaveCount(6);
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    // CLEAR: silence now, effect tails included.
    await page.click('#clear-layers');
    await expect(page.locator('#layers')).toHaveText('CAPAS 0/6');
    await waitQuiet(page, 1000);
    expect(errors).toEqual([]);
  });

  test('cortar el cable, parar el transporte o quitar el nodo sueltan las capas', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = watchErrors(page);
    await page.goto('/');
    await addNode(page, 'drone');
    await page.click('[data-mode="hold"]');
    const hold = () =>
      page.evaluate(() => {
        window.__mono.live.padDown(1, { x: 0.4, y: 0.5 });
        window.__mono.live.padUp(1);
        window.__mono.live.padDown(2, { x: 0.8, y: 0.3 });
        window.__mono.live.padUp(2);
      });

    await hold();
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    await clickCable(page, 'drone');
    await expect(page.locator('#layers')).toHaveText('CAPAS 0/6');
    await waitQuiet(page, 1000); // the cable fades in milliseconds
    await clickCable(page, 'drone');
    expect(await peakLevel(page)).toBeLessThan(0.001); // released, not muted

    await hold();
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    await page.click('#play'); // stop
    await expect(page.locator('#layers')).toHaveText('CAPAS 0/6');
    await waitQuiet(page);

    await hold(); // playable with the transport stopped
    expect(await peakLevel(page)).toBeGreaterThan(0.01);
    await page.click('#rm');
    await waitQuiet(page, 1000);
    expect(errors).toEqual([]);
  });
});

test.describe('mezcla con LEAD y DRONE', () => {
  test('los cinco instrumentos juntos, LEAD y seis capas de DRONE, no pasan de 0 dBFS', async ({ page }) => {
    await page.goto('/');
    for (const id of ['drum', 'bass', 'synth', 'lead', 'drone']) await addNode(page, id);
    await page.waitForTimeout(2500); // the sequenced modules join at a bar line
    await page.evaluate(() => {
      window.__mono.live.keyDown(1, 7);
      // Six layers at the top of the pad: brightest, moving most.
      for (let i = 0; i < 6; i++) window.__mono.live.padDown(10 + i, { x: 0.1 + i * 0.15, y: 0.1 });
    });
    const mix = await page.evaluate(
      () =>
        new Promise<{ bus: number; out: number; reduction: number }>((resolve) => {
          let bus = 0;
          let out = 0;
          let reduction = 0;
          const timer = setInterval(() => {
            const m = window.__mono.mix();
            bus = Math.max(bus, m.bus);
            out = Math.max(out, m.out);
            reduction = Math.min(reduction, m.reduction);
          }, 15);
          setTimeout(() => {
            clearInterval(timer);
            resolve({ bus, out, reduction });
          }, 5000);
        }),
    );
    console.log('mezcla con LEAD y DRONE', JSON.stringify(mix));
    expect(mix.bus).toBeGreaterThan(0.2);
    expect(mix.out).toBeLessThan(1);
    expect(mix.reduction).toBeGreaterThan(-6);
  });
});
