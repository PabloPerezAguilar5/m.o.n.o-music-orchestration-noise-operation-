import { expect, test, type Page } from '@playwright/test';

/**
 * ON/OFF of each node with a level knob, under that knob on MASTER: a mute at the node's
 * output, with the sequencer and the clock running inside. Saved in the patch.
 */

interface Mono {
  level(): number;
  store: { getState(): { on: Record<string, boolean>; transport: { step: number } } };
  live: {
    keyDown(touch: number, semitone: number): void;
    keyUp(touch: number): void;
    padDown(touch: number, point: { x: number; y: number }): void;
    padUp(touch: number): void;
  };
  patches: { current(name: string): { date: string } };
}
const mono = <T>(page: Page, run: (m: Mono) => T): Promise<T> =>
  page.evaluate(`(${run.toString()})(window.__mono)`) as Promise<T>;

async function addNode(page: Page, id: string): Promise<void> {
  await page.click('#add');
  await page.click(`.chip[data-id="${id}"]`);
}

/** Highest master level over ~`ms`. */
async function peak(page: Page, ms = 1200): Promise<number> {
  let top = 0;
  for (let t = 0; t < ms; t += 40) {
    top = Math.max(top, await mono(page, (m) => m.level()));
    await page.waitForTimeout(40);
  }
  return top;
}

const key = (id: string) => `#on-${id}`;
const looksOff = async (page: Page, id: string) => {
  await expect(page.locator(`#nd-${id}`)).toHaveClass(/\bmute\b/);
  await expect(page.locator(`#nd-${id}`)).not.toHaveClass(/\bon\b/);
  await expect(page.locator(`#nd-${id} .mutebar`)).toHaveCount(1);
};

test('MASTER tiene un ON/OFF bajo cada perilla de volumen de nodo, y solo ahí', async ({ page }) => {
  await page.goto('/');
  for (const id of ['synth', 'drum', 'bass', 'drone', 'lead', 'dist', 'lfo']) await addNode(page, id);
  await page.click('#nd-master');
  await expect(page.locator('[data-node]')).toHaveCount(5); // DISTORSIÓN and LFO have no level knob
  await expect(page.locator('[data-node]')).toHaveText(['ON', 'ON', 'ON', 'ON', 'ON']);
  // Each key is right under its knob, and lit with its node's colour.
  for (const [node, knob, colour] of [
    ['synth', 'synthLevel', 'rgb(0, 255, 179)'],
    ['drum', 'drumLevel', 'rgb(255, 0, 122)'],
    ['bass', 'bassLevel', 'rgb(167, 0, 255)'],
    ['drone', 'droneLevel', 'rgb(255, 69, 0)'],
    ['lead', 'leadLevel', 'rgb(0, 229, 255)'],
  ] as const) {
    const k = (await page.locator(`mono-knob[data-param="${knob}"]`).boundingBox())!;
    const b = (await page.locator(key(node)).boundingBox())!;
    expect(b.y).toBeGreaterThan(k.y + k.height - 1);
    expect(Math.abs(b.x + b.width / 2 - (k.x + k.width / 2))).toBeLessThan(4);
    const led = await page.locator(key(node)).evaluate((el) => getComputedStyle(el, '::before').backgroundColor);
    expect(led).toBe(colour);
  }
});

test('DRUM: apretar OFF apaga el nodo en el lienzo y el sonido; ON lo devuelve en tiempo; el reloj no se detiene', async ({ page }) => {
  await page.goto('/');
  await addNode(page, 'drum');
  await expect(page.locator('mono-app')).toHaveAttribute('audio-state', 'running');
  expect(await peak(page)).toBeGreaterThan(0.01);
  await page.click('#nd-master');

  await expect(page.locator(key('drum'))).toHaveText('ON');
  await page.click(key('drum'));
  await expect(page.locator(key('drum'))).toHaveText('OFF');
  await expect(page.locator(key('drum'))).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#lcd')).toHaveText('DRUM OFF');
  // Grey in the canvas, with its mute bar; the cable stays.
  await looksOff(page, 'drum');
  await expect(page.locator('#cb-drum-master')).toHaveCount(1);
  await expect(page.locator('#cb-drum-master')).not.toHaveClass(/\boff\b/);
  // The OFF key has no colour: its LED is not lit.
  const led = (id: string) => page.locator(key(id)).evaluate((el) => getComputedStyle(el, '::before').backgroundColor);
  expect(await led('drum')).not.toBe('rgb(255, 0, 122)');

  // Silent (the fade is a few tens of ms), now and later, with the transport still running.
  await page.waitForTimeout(150);
  expect(await peak(page, 1500)).toBeLessThan(0.001);
  const step = () => mono(page, (m) => m.store.getState().transport.step);
  const before = await step();
  await expect.poll(step).not.toBe(before);
  await expect(page.locator('#nd-drum')).not.toHaveClass(/\bon\b/); // never lit while OFF, in a whole bar
  await page.waitForTimeout(2200);
  await looksOff(page, 'drum');

  // ON: sound and light come back, on the clock that never stopped.
  await page.click(key('drum'));
  await expect(page.locator(key('drum'))).toHaveText('ON');
  await expect(page.locator('#nd-drum')).not.toHaveClass(/\bmute\b/);
  expect(await peak(page)).toBeGreaterThan(0.01);
  await expect(page.locator('#nd-drum.on')).toHaveCount(1, { timeout: 2500 });
});

test('un nodo OFF no suena aunque el mixer esté abierto; los demás siguen', async ({ page }) => {
  await page.goto('/');
  await addNode(page, 'drum');
  await addNode(page, 'bass');
  await expect(page.locator('mono-app')).toHaveAttribute('audio-state', 'running');
  await page.click('#nd-master');
  await page.click(key('drum'));
  await page.waitForTimeout(200);
  expect(await peak(page)).toBeGreaterThan(0.005); // BASS still plays
  await page.click(key('bass'));
  await page.waitForTimeout(200);
  expect(await peak(page, 1500)).toBeLessThan(0.001);
  await page.click(key('drum'));
  await page.click(key('bass'));
  expect(await peak(page)).toBeGreaterThan(0.01);
});

test('LEAD OFF: el teclado sigue mostrando la tecla pero no suena; DRONE OFF: el pad no suena', async ({ page }) => {
  await page.goto('/');
  await addNode(page, 'lead');
  await addNode(page, 'drone');
  await expect(page.locator('mono-app')).toHaveAttribute('audio-state', 'running');
  await page.click('#nd-master');
  await page.click(key('lead'));
  await page.click(key('drone'));
  await page.waitForTimeout(150);

  await page.click('#nd-lead');
  await mono(page, (m) => m.live.keyDown(1, 7));
  await expect(page.locator('mono-keys .p')).toHaveCount(1); // the key is shown pressed
  expect(await peak(page, 800)).toBeLessThan(0.001);
  await expect(page.locator('#nd-lead')).not.toHaveClass(/\bon\b/);
  await mono(page, (m) => m.live.keyUp(1));

  await page.click('#nd-drone');
  await mono(page, (m) => m.live.padDown(1, { x: 0.4, y: 0.5 }));
  expect(await peak(page, 1000)).toBeLessThan(0.001);
  await expect(page.locator('#nd-drone')).not.toHaveClass(/\bon\b/);
  await mono(page, (m) => m.live.padUp(1));

  // ON again: both play.
  await page.click('#nd-master');
  await page.click(key('lead'));
  await page.click(key('drone'));
  await mono(page, (m) => m.live.keyDown(2, 7));
  expect(await peak(page, 800)).toBeGreaterThan(0.01);
  await mono(page, (m) => m.live.keyUp(2));
});

test('el estado se mantiene al recargar', async ({ page }) => {
  await page.goto('/');
  await addNode(page, 'drum');
  await addNode(page, 'synth');
  await page.click('#play');
  await page.click('#nd-master');
  await page.click(key('drum'));
  await page.waitForTimeout(1500); // autosave
  await page.reload();
  await expect(page.locator('#lcd')).toHaveText('SESIÓN RESTAURADA · TOCÁ PLAY PARA SEGUIR');
  await page.click('#nd-master');
  await expect(page.locator(key('drum'))).toHaveText('OFF');
  await expect(page.locator(key('synth'))).toHaveText('ON');
  await looksOff(page, 'drum');
  await expect(page.locator('#nd-synth')).not.toHaveClass(/\bmute\b/);
});

test('SAVE, LOAD y SHARE conservan el OFF', async ({ page, browser }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await addNode(page, 'drum');
  await addNode(page, 'bass');
  await page.click('#play');
  await page.click('#nd-master');
  await page.click(key('bass'));

  await page.click('#patch-save');
  await page.locator('#patch-name').fill('Mute');
  await page.locator('#patch-name').press('Enter');
  await expect(page.locator('#lcd')).toHaveText('GUARDADO · Mute');

  // SHARE, before changing anything.
  await page.click('#patch-share');
  const url = await page.evaluate(() => navigator.clipboard.readText());

  // Everything ON again, then LOAD brings the OFF back.
  await page.click(key('bass'));
  await expect(page.locator(key('bass'))).toHaveText('ON');
  await page.click('#patch-load');
  await page.click('[data-open]');
  await expect(page.locator('#lcd')).toHaveText('CARGADO · Mute');
  await expect(page.locator(key('bass'))).toHaveText('OFF');
  await expect(page.locator(key('drum'))).toHaveText('ON');
  await looksOff(page, 'bass');

  // SHARE: another context opens the link with the same OFF.
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.locator('#lcd')).toHaveText('PATCH LISTO · TOCÁ PLAY O UN CONTROL PARA EMPEZAR');
  await other.click('#nd-master');
  await expect(other.locator(key('bass'))).toHaveText('OFF');
  await expect(other.locator(key('drum'))).toHaveText('ON');
  await expect(other.locator('#nd-bass')).toHaveClass(/\bmute\b/);
  await context.close();
});

test('un patch viejo, sin el campo, abre con todos en ON (IMPORT)', async ({ page }) => {
  await page.goto('/');
  const patch = { v: 1, name: 'Viejo', bpm: 100, nodes: ['master', 'drum', 'synth'], cables: [] };
  await page.click('#nd-master');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('#patch-import'),
  ]);
  await chooser.setFiles({ name: 'viejo.mono', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(patch)) });
  await expect(page.locator('#nd-drum')).toHaveCount(1);
  await expect(page.locator(key('drum'))).toHaveText('ON');
  await expect(page.locator(key('synth'))).toHaveText('ON');
});

test('MASTER con 5 botones ON/OFF cabe a 844x390 y 740x360, con botones de 44 px', async ({ page }) => {
  for (const [width, height] of [
    [844, 390],
    [740, 360],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    for (const id of ['synth', 'drum', 'bass', 'drone', 'lead']) await addNode(page, id);
    await page.click('#nd-master');
    const column = page.locator('mono-panel .kr');
    for (const id of ['synth', 'drum', 'bass', 'drone', 'lead']) {
      const button = page.locator(key(id));
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport({ ratio: 1 });
      const box = (await button.boundingBox())!;
      expect(box.width, `${width} ${id}`).toBeGreaterThanOrEqual(43.5);
      expect(box.height, `${width} ${id}`).toBeGreaterThanOrEqual(43.5);
    }
    // The column scrolls inside itself; nothing sticks out sideways.
    expect(await column.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  }
});
