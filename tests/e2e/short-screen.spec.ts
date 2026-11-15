import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 9: short screens (a phone on its side, from 360 px tall). Every panel must show all
 * its rows, or scroll inside itself so each row can be reached, with 44 px controls. Taller
 * screens must not change (see docs/LAYOUT.md).
 */

const SIZES = [
  { name: '844x390', width: 844, height: 390 },
  { name: '740x360', width: 740, height: 360 },
] as const;

const PANELS = [
  { name: 'master', node: null, voice: null },
  { name: 'drum', node: 'drum', voice: null },
  { name: 'bass (synth)', node: 'bass', voice: null },
  { name: 'bass (slice)', node: 'bass', voice: 'slice' },
  { name: 'synth', node: 'synth', voice: null },
  { name: 'lead', node: 'lead', voice: null },
  { name: 'drone', node: 'drone', voice: null },
  { name: 'dist', node: 'dist', voice: null },
  { name: 'lfo', node: 'lfo', voice: null },
] as const;

/** Runs in the page: what is wrong with the open panel, as readable lines. */
async function inspectPanel(page: Page): Promise<{ problems: string[]; scrollers: number; controls: number }> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const panel = document.querySelector('mono-app')?.shadowRoot?.querySelector('mono-panel');
    if (!panel) throw new Error('panel not found');

    const kids = (el: Element): Element[] => [...el.children, ...(el.shadowRoot ? [...el.shadowRoot.children] : [])];
    const all = (root: Element): Element[] => kids(root).flatMap((child) => [child, ...all(child)]);
    const name = (el: Element): string =>
      `${el.localName}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').join('.') : ''}`;
    const rect = (el: Element): DOMRect => el.getBoundingClientRect();
    const scrolls = (el: Element): boolean => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY);
    const clips = (el: Element): boolean => getComputedStyle(el).overflowY !== 'visible';

    // The panel is inside the window and the page itself never scrolls.
    const box = rect(panel);
    if (box.bottom > innerHeight + 1 || box.right > innerWidth + 1 || box.left < -1) {
      problems.push(`panel leaves the window: ${JSON.stringify(box)}`);
    }
    const doc = document.documentElement;
    if (doc.scrollHeight > innerHeight + 1 || doc.scrollWidth > innerWidth + 1) problems.push('the page scrolls');

    const inner = (panel.shadowRoot as ShadowRoot).children;
    const roots = [...inner].flatMap((el) => [el, ...all(el)]);

    // Scrollers: .kr (knobs), .zn (zone), the SLICE host, and lists.
    const scrollers = roots.filter(
      (el) =>
        scrolls(el) && (el.matches('.kr, .zn, .list') || el.localName === 'mono-slicer') && rect(el).height > 0,
    );
    const content = (el: Element): Element[] =>
      kids(el).flatMap((child) => {
        const r = rect(child);
        if (r.width === 0 || r.height === 0 || getComputedStyle(child).position === 'absolute') return [];
        return clips(child) ? [child] : [child, ...content(child)];
      });
    for (const scroller of scrollers) {
      const area = rect(scroller);
      // Horizontal: nothing wider than the scroller.
      if (scroller.scrollWidth > scroller.clientWidth + 1) {
        problems.push(`${name(scroller)} overflows sideways (${scroller.scrollWidth} > ${scroller.clientWidth})`);
      }
      // Scrolled to the end, nothing may still hang out: that would be a row cut by something further out.
      scroller.scrollTop = scroller.scrollHeight;
      for (const el of content(scroller)) {
        if (rect(el).bottom > area.bottom + 1.5) problems.push(`${name(el)} is cut at the bottom even when scrolled to the end`);
      }
      scroller.scrollTop = 0;
      for (const el of content(scroller)) {
        if (rect(el).top < area.top - 1.5) problems.push(`${name(el)} is cut at the top`);
      }
    }

    const plate = roots.find((el) => el.classList.contains('plate'));
    if (plate && plate.scrollHeight > plate.clientHeight + 1) problems.push('the plate overflows');

    // Touch targets: at least 44 px each way. Step keys and the pieces of a SLICE wave are
    // exempt (sixteen columns do not leave the width; see docs/LAYOUT.md), and so is the
    // remove key, whose tap area is 44 px through a pseudo-element.
    const controls = roots.filter(
      (el) =>
        (el.matches('button, [role="slider"], .it, input') || el.localName === 'mono-keys') &&
        !el.matches('.st, .sl, #rm') &&
        rect(el).width > 0,
    );
    for (const control of controls) {
      const r = rect(control);
      if (r.width < 43.5 || r.height < 43.5) {
        problems.push(`${name(control)} is ${Math.round(r.width)}x${Math.round(r.height)}, under 44 px`);
      }
    }
    return { problems, scrollers: scrollers.length, controls: controls.length };
  });
}

async function openPanel(page: Page, node: string | null, voice: string | null): Promise<void> {
  await page.goto('/');
  if (node) {
    await page.click('#add');
    await page.click(`.chip[data-id="${node}"]`);
    if (voice) await page.click(`[data-voice="${voice}"]`);
  }
  await expect(page.locator('#lcd')).toBeVisible();
}

for (const size of SIZES) {
  test.describe(`pantalla baja ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });

    for (const panel of PANELS) {
      test(`${panel.name}: se ve completo o con scroll interno, controles de 44 px`, async ({ page }) => {
        await openPanel(page, panel.node, panel.voice);
        const result = await inspectPanel(page);
        expect(result.problems).toEqual([]);
        expect(result.controls).toBeGreaterThan(0);
      });
    }

    test('el panel de patches (LOAD) lista todas las filas con scroll interno', async ({ page }) => {
      await openPanel(page, null, null);
      for (const name of ['uno', 'dos', 'tres', 'cuatro', 'cinco']) {
        await page.click('#patch-save');
        await page.fill('#patch-name', name);
        await page.press('#patch-name', 'Enter');
        await expect(page.locator('#lcd')).toContainText(new RegExp(name, 'i'));
      }
      await page.click('#patch-load');
      await expect(page.locator('mono-patch-list .row')).toHaveCount(5);
      const result = await inspectPanel(page);
      expect(result.problems).toEqual([]);
      // The list scrolls inside itself: its first and last rows can both be reached.
      for (const row of [page.locator('mono-patch-list .row').last(), page.locator('mono-patch-list .row').first()]) {
        await row.scrollIntoViewIfNeeded();
        await expect(row).toBeInViewport({ ratio: 0.9 });
      }
    });

    test('SYNTH: el teclado, los 16 pasos y LARGO se ven completos, sin scroll', async ({ page }) => {
      await openPanel(page, 'synth', null);
      // The zone holds the whole keyboard, the sixteen steps and LARGO: it has nothing to scroll.
      const zone = page.locator('mono-panel .zn');
      expect(await zone.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
      const parts = [
        '.nk[data-note="0"]',
        '.nk[data-note="9"]',
        '.st[data-c="0"]',
        '.st[data-c="15"]',
        '[data-len="1"]',
        '[data-len="4"]',
        '#auto',
      ];
      for (const part of parts) await expect(page.locator(`mono-synth-notes ${part}`)).toBeInViewport({ ratio: 1 });
      // Keys and buttons are for a finger: 44 px each way (the sixteen steps are exempt, see docs/LAYOUT.md).
      for (const part of ['.nk', '[data-len]', '#auto']) {
        for (const box of await page.locator(`mono-synth-notes ${part}`).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))) {
          expect(box.width, part).toBeGreaterThanOrEqual(43.5);
          expect(box.height, part).toBeGreaterThanOrEqual(43.5);
        }
      }
    });

    test('el divisor se arrastra: el lienzo se achica y el panel gana espacio', async ({ page }) => {
      await openPanel(page, 'drum', null);
      const stage = page.locator('mono-stage');
      const panel = page.locator('mono-panel');
      const split = page.locator('#split');
      await expect(split).toBeVisible();
      // Start from a roomy canvas: on the lowest screens the default is already the smallest.
      await split.focus();
      for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
      const before = { stage: (await stage.boundingBox())!.height, panel: (await panel.boundingBox())!.height };
      const handle = (await split.boundingBox())!;
      const x = handle.x + handle.width / 2;
      const y = handle.y + handle.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y - 40, { steps: 6 });
      await page.mouse.up();
      const shrunk = { stage: (await stage.boundingBox())!.height, panel: (await panel.boundingBox())!.height };
      expect(shrunk.stage).toBeLessThan(before.stage - 10);
      expect(shrunk.panel).toBeGreaterThan(before.panel + 10);
      // The other way, and with the keyboard.
      await split.focus();
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
      expect((await stage.boundingBox())!.height).toBeGreaterThan(shrunk.stage + 10);
      // Never below the room the canvas needs for its keys.
      for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowUp');
      expect((await stage.boundingBox())!.height).toBeGreaterThanOrEqual(87);
      const result = await inspectPanel(page);
      expect(result.problems).toEqual([]);
    });

    test('el lienzo sigue usable: play y + de 44 px, el menu entra', async ({ page }) => {
      await openPanel(page, null, null);
      for (const selector of ['#play', '#add']) {
        const box = (await page.locator(selector).boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(43.5);
        expect(box.height).toBeGreaterThanOrEqual(43.5);
      }
      await page.click('#add');
      const chips = page.locator('.chip');
      await expect(chips).toHaveCount(7);
      const area = (await page.locator('mono-stage').boundingBox())!;
      for (const chip of await chips.all()) {
        const box = (await chip.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(43.5);
        expect(box.y).toBeGreaterThanOrEqual(area.y);
        expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height + 1);
        expect(box.x).toBeGreaterThanOrEqual(0);
      }
    });
  });
}

test.describe('pantalla alta: sin cambios', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('no hay divisor y las perillas siguen arriba de la zona', async ({ page }) => {
    await openPanel(page, 'drum', null);
    await expect(page.locator('#split')).toBeHidden();
    const layout = await page.evaluate(() => {
      const panel = document.querySelector('mono-app')?.shadowRoot?.querySelector('mono-panel')?.shadowRoot;
      const plate = panel?.querySelector('.plate');
      const kr = panel?.querySelector('.kr');
      return {
        direction: plate ? getComputedStyle(plate).flexDirection : null,
        scrolls: kr ? getComputedStyle(kr).overflowY : null,
      };
    });
    expect(layout).toEqual({ direction: 'column', scrolls: 'visible' });
  });
});

test.describe('audio no disponible', () => {
  test('sin AudioWorklet fuera de https: lo dice el display de MASTER, desde el inicio', async ({ page }) => {
    await page.addInitScript(() => {
      // What a page served over plain http (not localhost) looks like.
      Object.defineProperty(window, 'isSecureContext', { value: false });
      Reflect.deleteProperty(window, 'AudioWorkletNode');
      Reflect.deleteProperty(BaseAudioContext.prototype, 'audioWorklet');
    });
    await page.goto('/');
    await expect(page.locator('#lcd')).toHaveText('AUDIO NO DISPONIBLE: ABRÍ LA APP DESDE HTTPS O LOCALHOST');
    // DRUM does not need a worklet: its own display is untouched.
    await page.click('#add');
    await page.click('.chip[data-id="drum"]');
    await expect(page.locator('#lcd')).toHaveText('DRUM · 808');
    // SYNTH does, so it says why.
    await page.click('#add');
    await page.click('.chip[data-id="synth"]');
    await expect(page.locator('#lcd')).toHaveText(/AUDIO NO DISPONIBLE/);
  });

  test('con https pero sin AudioWorklet (navegador viejo) avisa que el audio queda limitado', async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'AudioWorkletNode');
      Reflect.deleteProperty(BaseAudioContext.prototype, 'audioWorklet');
    });
    await page.goto('/');
    await expect(page.locator('#lcd')).toHaveText('AUDIO LIMITADO: ESTE NAVEGADOR NO TIENE AUDIOWORKLET');
  });

  test('sin Web Audio: lo dice y la app sigue en pie', async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'AudioContext');
      Reflect.deleteProperty(window, 'webkitAudioContext');
    });
    await page.goto('/');
    await expect(page.locator('#lcd')).toHaveText('AUDIO NO DISPONIBLE: ESTE NAVEGADOR NO TIENE WEB AUDIO');
    await page.click('#add');
    await page.click('.chip[data-id="drum"]');
    await expect(page.locator('#lcd')).toHaveText(/AUDIO NO DISPONIBLE/);
  });

  test('con todo disponible el display de MASTER no avisa nada', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#lcd')).toHaveText('MASTER · MST-00');
  });
});
