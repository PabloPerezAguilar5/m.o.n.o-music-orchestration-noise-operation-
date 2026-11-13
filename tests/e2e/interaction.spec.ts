import { expect, test, type Locator, type Page } from '@playwright/test';

const INSTRUMENTS = ['synth', 'drum', 'bass', 'drone', 'dist', 'lfo', 'lead'] as const;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

async function addNode(page: Page, id: string): Promise<void> {
  await page.click('#add');
  await page.click(`.chip[data-id="${id}"]`);
}

/** Canvas position of a node, read from its transform. */
async function positionOf(node: Locator): Promise<{ x: number; y: number }> {
  const transform = (await node.getAttribute('transform')) ?? '';
  const [x, y] = (transform.match(/-?[\d.]+/g) ?? []).map(Number);
  return { x: x ?? NaN, y: y ?? NaN };
}

/** Presses on the centre of `target`, moves by (dx, dy) screen pixels and releases. */
async function dragBy(page: Page, target: Locator, dx: number, dy: number): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error('drag target is not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

test.describe('lienzo', () => {
  test('arranca solo con MASTER, detenido y con la ayuda visible', async ({ page }) => {
    await expect(page.locator('.nd')).toHaveCount(1);
    await expect(page.locator('#nd-master')).toHaveClass(/sel/);
    await expect(page.locator('.cb')).toHaveCount(0);
    await expect(page.locator('#hint')).toBeVisible();
    await expect(page.locator('#play')).not.toHaveClass(/on/);
    await expect(page.locator('#lcd')).toHaveText('MASTER · MST-00');
    await expect(page.locator('#rm')).toHaveCount(0);
  });

  test('el boton + abre y cierra el menu con los siete nodos', async ({ page }) => {
    await page.click('#add');
    await expect(page.locator('.chip')).toHaveCount(7);
    await expect(page.locator('#hint')).toHaveCount(0); // the hint never shows behind the chips
    await page.click('#add');
    await expect(page.locator('.chip')).toHaveCount(0);
    await expect(page.locator('#hint')).toBeVisible();
  });

  test('agregar un nodo lo conecta, lo selecciona y arranca la reproduccion', async ({ page }) => {
    await addNode(page, 'synth');
    await expect(page.locator('#nd-synth')).toHaveClass(/sel/);
    await expect(page.locator('#cb-synth')).toHaveCount(1);
    await expect(page.locator('#lcd')).toHaveText('SYNTH · PLUCK · C PENTA MENOR');
    await expect(page.locator('#play')).toHaveClass(/on/);
    await expect(page.locator('#hint')).toHaveCount(0);
    await expect(page.locator('.chip')).toHaveCount(0);

    // The playhead moves across the sequencer.
    const playheadColumn = () => page.locator('.st.ph').first().getAttribute('data-c');
    await expect(page.locator('.st.ph')).toHaveCount(11); // one key per row of the SYNTH grid
    const before = await playheadColumn();
    await expect.poll(playheadColumn).not.toBe(before);
  });

  test('solo se ofrece un nodo de cada tipo', async ({ page }) => {
    await addNode(page, 'synth');
    await page.click('#add');
    await expect(page.locator('.chip')).toHaveCount(6);
    await expect(page.locator('.chip[data-id="synth"]')).toHaveCount(0);
  });

  test('con los siete nodos el boton + desaparece y vuelve al quitar uno', async ({ page }) => {
    for (const id of INSTRUMENTS) await addNode(page, id);
    await expect(page.locator('.nd')).toHaveCount(8);
    await expect(page.locator('.cb')).toHaveCount(7);
    await expect(page.locator('#cb-lfo')).toHaveAttribute('stroke-dasharray', '6 6');
    await expect(page.locator('#add')).toHaveCount(0);

    await page.click('#rm');
    await expect(page.locator('#add')).toBeVisible();
  });

  test('arrastrar un nodo lo mueve y el cable lo sigue', async ({ page }) => {
    await addNode(page, 'drum');
    const node = page.locator('#nd-drum');
    const start = await positionOf(node);

    await dragBy(page, node.locator('.hit'), 120, -60);

    const end = await positionOf(node);
    expect(end.x).toBeGreaterThan(start.x + 50);
    expect(end.y).toBeLessThan(start.y - 20);
    const cable = page.locator('#cb-drum');
    expect(Number(await cable.getAttribute('x1'))).toBeCloseTo(end.x, 3);
    expect(Number(await cable.getAttribute('y1'))).toBeCloseTo(end.y, 3);
    expect(await cable.getAttribute('x2')).toBe('400');
    expect(await cable.getAttribute('y2')).toBe('175');
  });

  test('un nodo no puede salir del lienzo', async ({ page }) => {
    await addNode(page, 'drum');
    const node = page.locator('#nd-drum');
    await dragBy(page, node.locator('.hit'), -900, 900);
    expect(await positionOf(node)).toEqual({ x: 48, y: 335 });
  });

  test('MASTER se selecciona pero no se mueve', async ({ page }) => {
    await addNode(page, 'drum');
    const master = page.locator('#nd-master');
    await dragBy(page, master.locator('.hit'), 150, 60);
    expect(await positionOf(master)).toEqual({ x: 400, y: 175 });
    await expect(master).toHaveClass(/sel/);
    await expect(page.locator('#lcd')).toHaveText('MASTER · MST-00');
  });

  test('tocar un nodo lo selecciona y cierra el menu', async ({ page }) => {
    await addNode(page, 'bass');
    await page.click('#add');
    await expect(page.locator('.chip')).toHaveCount(6);
    await page.click('#nd-master');
    await expect(page.locator('.chip')).toHaveCount(0);
    await expect(page.locator('#lcd')).toHaveText('MASTER · MST-00');
    await page.click('#nd-bass');
    await expect(page.locator('#lcd')).toHaveText('BASS · C PENTA MENOR'); // BASS shows its key
  });

  test('el boton de reproduccion arranca y detiene', async ({ page }) => {
    const play = page.locator('#play');
    await play.click();
    await expect(play).toHaveClass(/on/);
    await expect(play).toHaveText('■');
    await play.click();
    await expect(play).not.toHaveClass(/on/);
    await expect(play).toHaveText('▶');
  });
});

test.describe('panel', () => {
  test('el panel toma el color del nodo seleccionado', async ({ page }) => {
    const color = () =>
      page.locator('mono-panel').evaluate((el) => getComputedStyle(el).getPropertyValue('--c'));
    expect(await color()).toBe('#EDEDF7');
    await addNode(page, 'drum');
    expect(await color()).toBe('#FF007A');
  });

  test('quitar un nodo vuelve a MASTER sin detener la reproduccion', async ({ page }) => {
    await addNode(page, 'bass');
    await page.click('#rm');
    await expect(page.locator('#nd-bass')).toHaveCount(0);
    await expect(page.locator('#cb-bass')).toHaveCount(0);
    await expect(page.locator('#lcd')).toHaveText('MASTER · MST-00');
    await expect(page.locator('#hint')).toBeVisible();
    await expect(page.locator('#play')).toHaveClass(/on/);
  });

  test('cada nodo muestra sus perillas y su zona', async ({ page }) => {
    const expected = {
      synth: { knobs: 6, zone: 'mono-step-grid' },
      drum: { knobs: 8, zone: 'mono-step-grid' }, // TONO and VOL per row
      bass: { knobs: 4, zone: 'mono-step-grid' },
      drone: { knobs: 5, zone: 'mono-xy-pad' }, // FILTRO ATAQUE RELEASE DESAF. VOL
      dist: { knobs: 3, zone: 'mono-type-switch' },
      lfo: { knobs: 3, zone: 'mono-wave' },
      lead: { knobs: 6, zone: 'mono-keys' }, // ONDA CUTOFF RESO ATAQUE RELEASE GLIDE
    } as const;
    await expect(page.locator('mono-tempo')).toBeVisible();
    for (const id of INSTRUMENTS) {
      await addNode(page, id);
      // +1: the CAOS macro knob.
      await expect(page.locator('mono-knob')).toHaveCount(expected[id].knobs + 1);
      await expect(page.locator(`.zn > ${expected[id].zone}`)).toBeVisible();
      await expect(page.locator('.zn > *')).toHaveCount(1);
    }
    await expect(page.locator('mono-step-grid .st')).toHaveCount(0);
    await page.click('#nd-drum');
    await expect(page.locator('.st')).toHaveCount(4 * 16);
    await page.click('#nd-synth');
    await expect(page.locator('.st')).toHaveCount(11 * 16); // ten notes over two octaves and DUR
  });

  test('una perilla gira al arrastrar, se lee en el display y conserva su valor', async ({
    page,
  }) => {
    await addNode(page, 'synth');
    const knob = page.locator('mono-knob').first().locator('.kn');
    await expect(knob).toHaveAttribute('aria-valuenow', '44'); // 0.35 * 127

    await dragBy(page, knob, 0, -55); // half of the full travel: +0.5
    await expect(page.locator('#lcd')).toHaveText('SYNTH ONDA 108');
    await expect(knob).toHaveAttribute('aria-valuenow', '108');

    await page.click('#nd-master');
    await page.click('#nd-synth');
    await expect(page.locator('#lcd')).toHaveText('SYNTH · PLUCK · C PENTA MENOR');
    await expect(knob).toHaveAttribute('aria-valuenow', '108');
  });

  test('una perilla no pasa de sus topes', async ({ page }) => {
    const knob = page.locator('mono-knob').first().locator('.kn');
    await dragBy(page, knob, 0, -400);
    await expect(knob).toHaveAttribute('aria-valuenow', '127');
    await expect(page.locator('#lcd')).toHaveText('MASTER SYNTH 127');
    await dragBy(page, knob, 0, 400);
    await expect(knob).toHaveAttribute('aria-valuenow', '0');
  });

  test('los pasos del secuenciador se prenden y apagan', async ({ page }) => {
    await addNode(page, 'drum');
    const step = page.locator('.st[data-r="0"][data-c="1"]');
    await expect(step).not.toHaveClass(/\ba\b/);
    await step.click();
    await expect(step).toHaveClass(/\ba\b/);
    await step.click();
    await expect(step).not.toHaveClass(/\ba\b/);

    // An active key stays cream on every beat; only its LED takes the node colour.
    const looks = await page.locator('.st.a').evaluateAll((keys) =>
      keys.map((key) => ({
        key: getComputedStyle(key).backgroundImage,
        led: getComputedStyle(key, '::before').backgroundColor,
      })),
    );
    expect(looks.length).toBeGreaterThan(0);
    for (const { key, led } of looks) {
      expect(key).toContain('linear-gradient');
      expect(led).toBe('rgb(255, 0, 122)'); // DRUM #FF007A
    }

    // Each node keeps its own pattern.
    await step.click();
    await addNode(page, 'bass');
    await expect(step).not.toHaveClass(/\ba\b/);
    await page.click('#nd-drum');
    await expect(step).toHaveClass(/\ba\b/);
  });

  test('la barra espaciadora reproduce y detiene', async ({ page }) => {
    const play = page.locator('#play');
    await expect(play).not.toHaveClass(/on/);
    await page.keyboard.press('Space');
    await expect(play).toHaveClass(/on/);
    await page.keyboard.press('Space');
    await expect(play).not.toHaveClass(/on/);

    // With a key focused (RNDM, just tapped), space plays/stops and does not press it again.
    await addNode(page, 'drum'); // starts playback
    // The pattern only (the playhead outline leaves when playback stops).
    const grid = () =>
      page.locator('mono-step-grid .st').evaluateAll((keys) => keys.map((k) => k.classList.contains('a')).join());
    await page.click('#rndm');
    const before = await grid();
    await page.keyboard.press('Space');
    await expect(play).not.toHaveClass(/on/);
    expect(await grid()).toBe(before);

    // While typing the tempo, space is just a key: playback does not change.
    await page.locator('#nd-master').click();
    await page.locator('mono-tempo .lcd').click();
    await page.keyboard.press('Space');
    await expect(play).not.toHaveClass(/on/);
    await page.keyboard.press('Escape');
  });

  test('el tempo sube y baja de a 1', async ({ page }) => {
    const bpm = page.locator('#bv');
    await expect(bpm).toHaveText('120');
    await page.click('[data-b="1"]');
    await expect(bpm).toHaveText('121');
    await page.click('[data-b="-1"]');
    await page.click('[data-b="-1"]');
    await expect(bpm).toHaveText('119');

    // Keyboard activation also steps by one.
    await page.focus('[data-b="1"]');
    await page.keyboard.press('Enter');
    await expect(bpm).toHaveText('120');
  });

  test('mantener apretado + acelera el cambio y soltar lo frena', async ({ page }) => {
    const plus = page.locator('[data-b="1"]');
    const bpm = async () => Number(await page.locator('#bv').textContent());
    const box = await plus.boundingBox();
    if (!box) throw new Error('+ is not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    await page.mouse.down();
    await page.waitForTimeout(700);
    const early = (await bpm()) - 120;
    await page.waitForTimeout(700);
    const late = (await bpm()) - 120 - early;
    await page.mouse.up();

    expect(early).toBeGreaterThanOrEqual(2); // first step + repeats after the hold delay
    expect(late).toBeGreaterThan(early * 2); // the second stretch moves much faster
    const released = await bpm();
    await page.waitForTimeout(400);
    expect(await bpm()).toBe(released);
  });

  test('mantener apretado - llega al minimo y se queda ahi', async ({ page }) => {
    const minus = page.locator('[data-b="-1"]');
    const box = await minus.boundingBox();
    if (!box) throw new Error('- is not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.locator('#bv')).toHaveText('40', { timeout: 10_000 });
    await page.waitForTimeout(300);
    await page.mouse.up();
    await expect(page.locator('#bv')).toHaveText('40');
  });

  test('tocar el display permite escribir el tempo, entre 40 y 300', async ({ page }) => {
    const display = page.locator('mono-tempo .lcd');
    const input = page.locator('#bv-input');
    const bpm = page.locator('#bv');

    const type = async (text: string, confirm: 'Enter' | 'Escape' | 'blur' = 'Enter') => {
      await display.click();
      await expect(input).toBeFocused();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(text);
      if (confirm === 'blur') await page.click('#nd-master');
      else await page.keyboard.press(confirm);
      await expect(input).toHaveCount(0);
    };

    await type('128');
    await expect(bpm).toHaveText('128');
    await type('999');
    await expect(bpm).toHaveText('300');
    await page.click('[data-b="1"]');
    await expect(bpm).toHaveText('300');
    await type('5');
    await expect(bpm).toHaveText('40');
    await page.click('[data-b="-1"]');
    await expect(bpm).toHaveText('40');
    await type('abc');
    await expect(bpm).toHaveText('40');
    await type('90', 'Escape');
    await expect(bpm).toHaveText('40');
    await type('95', 'blur');
    await expect(bpm).toHaveText('95');
  });

  test('el display del tempo no cambia de ancho con 2 o 3 cifras', async ({ page }) => {
    const width = () => page.locator('mono-tempo .lcd').evaluate((el) => el.getBoundingClientRect().width);
    const wide = await width();
    await page.locator('mono-tempo .lcd').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('45');
    await page.keyboard.press('Enter');
    await expect(page.locator('#bv')).toHaveText('45');
    expect(await width()).toBeCloseTo(wide, 1);
  });

  test('el boton del panel MASTER arranca y detiene, y el cabezal se borra al parar', async ({
    page,
  }) => {
    await page.click('#pp');
    await expect(page.locator('#play')).toHaveClass(/on/);
    await page.click('#pp');
    await expect(page.locator('#play')).not.toHaveClass(/on/);

    await addNode(page, 'drum');
    await expect(page.locator('.st.ph')).toHaveCount(4);
    await page.click('#play');
    await expect(page.locator('.st.ph')).toHaveCount(0);
  });

  test('el pad de DRONE sigue al dedo: una capa mientras se toca (TOUCH), y sigue al soltar en HOLD', async ({
    page,
  }) => {
    await addNode(page, 'drone');
    const pad = page.locator('.xy');
    const box = await pad.boundingBox();
    if (!box) throw new Error('pad is not visible');
    const dot = () =>
      pad.locator('b').evaluate((el: HTMLElement) => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) }));
    // The pointer lands on a whole pixel, so allow one pixel of rounding on a small pad.
    const tolerance = 100 / Math.min(box.width, box.height) + 0.5;

    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.75);
    await page.mouse.down();
    await expect(pad.locator('b')).toHaveCount(1);
    let at = await dot();
    expect(Math.abs(at.left - 25)).toBeLessThan(tolerance);
    expect(Math.abs(at.top - 75)).toBeLessThan(tolerance);
    // Dragging moves the layer.
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 4 });
    at = await dot();
    expect(Math.abs(at.left - 60)).toBeLessThan(tolerance);
    await page.mouse.up();
    await expect(pad.locator('b')).toHaveCount(0); // TOUCH: it ends on release

    await page.click('[data-mode="hold"]');
    await pad.click({ position: { x: box.width * 0.2, y: box.height * 0.5 } });
    await pad.click({ position: { x: box.width * 0.8, y: box.height * 0.5 } });
    await expect(pad.locator('b')).toHaveCount(2);
    await expect(pad.locator('b.held')).toHaveCount(2);
    await expect(page.locator('#layers')).toHaveText('CAPAS 2/6');
    // Back to TOUCH: the held layers end.
    await page.click('[data-mode="touch"]');
    await expect(pad.locator('b')).toHaveCount(0);
  });

  test('el tipo de DISTORSION cambia y se conserva', async ({ page }) => {
    await addNode(page, 'dist');
    const key = (type: string) => page.locator(`mono-type-switch [data-type="${type}"]`);
    await expect(key('soft')).toHaveClass(/\ba\b/);
    await key('hard').click();
    await expect(key('hard')).toHaveClass(/\ba\b/);
    await expect(key('soft')).not.toHaveClass(/\ba\b/);

    await page.click('#nd-master');
    await page.click('#nd-dist');
    await expect(key('hard')).toHaveClass(/\ba\b/);
  });

  test('el teclado de LEAD tiene dos octavas desde C, con las negras en su lugar', async ({ page }) => {
    await addNode(page, 'lead');
    const white = page.locator('mono-keys .wk');
    await expect(white).toHaveText(['C4', 'D', 'E', 'F', 'G', 'A', 'B', 'C5', 'D', 'E', 'F', 'G', 'A', 'B', 'C6']);
    await expect(page.locator('mono-keys .bk')).toHaveCount(10);

    // Each black key must straddle the boundary between the two white keys it belongs to.
    const between = await page.locator('mono-keys').evaluate((keys) => {
      const root = keys.shadowRoot!;
      const whites = [...root.querySelectorAll('.wk')].map((key) => ({
        label: key.textContent!.trim(),
        rect: key.getBoundingClientRect(),
      }));
      return [...root.querySelectorAll<HTMLElement>('.bk')].map((key) => {
        const rect = key.getBoundingClientRect();
        const centre = rect.left + rect.width / 2;
        let left = -1;
        whites.forEach((w, i) => {
          if (w.rect.left <= centre) left = i;
        });
        const name = (label: string | undefined) => label?.replace(/\d/g, '') ?? '?';
        return `${key.dataset.note} ${name(whites[left]!.label)}-${name(whites[left + 1]?.label)}`;
      });
    });
    const octave = ['C# C-D', 'D# D-E', 'F# F-G', 'G# G-A', 'A# A-B'];
    expect(between).toEqual([...octave, ...octave]);

    // OCT − and + move the keyboard, within C1 … C8.
    await page.click('#oct-up');
    await expect(white.first()).toHaveText('C5');
    await expect(page.locator('#lcd')).toHaveText('LEAD · C5-C7');
    for (let i = 0; i < 4; i++) await page.click('#oct-up', { force: true });
    await expect(page.locator('#oct-up')).toBeDisabled();
    await expect(white.first()).toHaveText('C6');
    // SCALE LOCK dims the keys outside the scale and shows the key on the display.
    await page.click('#lock');
    await expect(page.locator('#lock')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#lcd')).toHaveText('LEAD · C6-C8 · C PENTA MENOR');
    // C, F and G of each octave and the top C are in C penta minor; the other eight white keys are not.
    await expect(page.locator('mono-keys .wk.out')).toHaveCount(8);
  });

  test('las teclas de LEAD se encienden mientras se tocan y el nodo mientras suena', async ({ page }) => {
    await addNode(page, 'lead');
    await page.click('#play'); // stop, so only the key press can light the node
    await expect(page.locator('#nd-lead')).not.toHaveClass(/\bon\b/);

    const key = page.locator('mono-keys .wk').nth(2);
    const box = (await key.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8);
    await page.mouse.down();
    await expect(key).toHaveClass(/\bp\b/);
    await expect(page.locator('#nd-lead')).toHaveClass(/\bon\b/);
    // Held: still lit well after a tap would have faded.
    await page.waitForTimeout(600);
    await expect(key).toHaveClass(/\bp\b/);
    await expect(page.locator('#nd-lead')).toHaveClass(/\bon\b/);

    // Sliding to the next key moves the light with the finger.
    const next = page.locator('mono-keys .wk').nth(3);
    const nextBox = (await next.boundingBox())!;
    await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height - 8, { steps: 3 });
    await expect(next).toHaveClass(/\bp\b/);
    await expect(key).not.toHaveClass(/\bp\b/);

    await page.mouse.up();
    await expect(page.locator('.wk.p')).toHaveCount(0);
    await expect(page.locator('#nd-lead')).not.toHaveClass(/\bon\b/);
  });

  test('HOLD del LEAD deja sonar la nota soltada hasta apagarlo', async ({ page }) => {
    await addNode(page, 'lead');
    await page.click('#play'); // stop, so only the held note can light the node
    await page.click('#hold');
    await expect(page.locator('#hold')).toHaveAttribute('aria-pressed', 'true');

    const tap = async (index: number) => {
      const key = page.locator('mono-keys .wk').nth(index);
      const box = (await key.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8);
      await page.mouse.down();
      await page.mouse.up();
      return key;
    };
    const first = await tap(2);
    await page.waitForTimeout(600);
    await expect(first).toHaveClass(/\bp\b/);
    await expect(page.locator('#nd-lead')).toHaveClass(/\bon\b/);
    // Another key takes its place.
    const second = await tap(4);
    await expect(second).toHaveClass(/\bp\b/);
    await expect(page.locator('mono-keys .wk.p')).toHaveCount(1);

    await page.click('#hold');
    await expect(page.locator('#hold')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('mono-keys .wk.p')).toHaveCount(0);
    await expect(page.locator('#nd-lead')).not.toHaveClass(/\bon\b/);
  });
});
