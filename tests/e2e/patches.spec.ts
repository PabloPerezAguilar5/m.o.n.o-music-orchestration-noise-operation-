import { expect, test, type Page } from '@playwright/test';

/**
 * Patches in the browser: SAVE, a reload that brings the session back, LOAD; a link
 * opened in another context that lands on the same state without any audio; a broken
 * file on IMPORT.
 */

async function addNode(page: Page, id: string): Promise<void> {
  await page.click('#add');
  await page.click(`.chip[data-id="${id}"]`);
}

/** The lasting part of the state, as the patch would hold it, without its date. */
const snapshot = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const mono = (window as unknown as { __mono: { patches: { current(name: string): { date: string } } } }).__mono;
    return JSON.stringify({ ...mono.patches.current('snap'), date: '' });
  });

/** Counts the AudioContexts a page creates. */
const countContexts = () => {
  const w = window as unknown as { __contexts: number; AudioContext: typeof AudioContext };
  w.__contexts = 0;
  const Native = w.AudioContext;
  w.AudioContext = class extends Native {
    constructor(options?: AudioContextOptions) {
      super(options);
      w.__contexts++;
    }
  };
};

test('guardar un patch, recargar (la sesión vuelve) y cargarlo desde LOAD; renombrar y borrar', async ({ page }) => {
  await page.goto('/');
  await addNode(page, 'drum');
  await addNode(page, 'bass');
  await page.click('#nd-master');
  await page.click('[data-b="1"]'); // 121 bpm
  await expect(page.locator('#bv')).toHaveText('121');
  await page.click('#play'); // stop

  await page.click('#patch-save');
  const name = page.locator('#patch-name');
  await expect(name).toBeFocused();
  await name.fill('Mi groove');
  await name.press('Enter');
  await expect(page.locator('#lcd')).toHaveText('GUARDADO · Mi groove');

  // Something more, then a reload: the session comes back as it was, stopped.
  await addNode(page, 'synth');
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator('.nd')).toHaveCount(4);
  await expect(page.locator('#play')).not.toHaveClass(/on/);
  await expect(page.locator('#lcd')).toHaveText('SESIÓN RESTAURADA · TOCÁ PLAY PARA SEGUIR');
  await expect(page.locator('#bv')).toHaveText('121');

  // LOAD lists the saved patch, with its name and a date, and opens it.
  await page.click('#patch-load');
  await expect(page.locator('#patch-load')).toHaveAttribute('aria-pressed', 'true');
  const rows = page.locator('mono-patch-list .row');
  await expect(rows).toHaveCount(1);
  await expect(rows.locator('.nm')).toHaveText('Mi groove');
  await expect(rows.locator('.dt')).not.toHaveText('');
  await page.click('[data-open]');
  await expect(page.locator('#lcd')).toHaveText('CARGADO · Mi groove');
  await expect(page.locator('.nd')).toHaveCount(3);
  await expect(page.locator('#nd-synth')).toHaveCount(0);
  await expect(page.locator('mono-tempo')).toBeVisible();

  // Rename, then delete (asked twice).
  await page.click('#patch-load');
  await page.click('[data-rename]');
  await page.locator('mono-patch-list input').fill('Groove 2');
  await page.locator('mono-patch-list input').press('Enter');
  await expect(rows.locator('.nm')).toHaveText('Groove 2');
  await page.click('[data-delete]');
  await expect(page.locator('[data-delete]')).toHaveText('¿BORRAR?');
  await page.click('[data-delete]');
  await expect(rows).toHaveCount(0);
  await expect(page.locator('mono-patch-list .msg')).toBeVisible();
  await page.click('#patch-close');
  await expect(page.locator('mono-tempo')).toBeVisible();
});

test('SHARE copia un link que abre el mismo patch en otro contexto, sin audio hasta tocar', async ({ page, browser }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await addNode(page, 'drum');
  await addNode(page, 'bass');
  await page.click('#nd-master');
  await page.click('[data-b="1"]');
  await page.click('#play');
  await page.click('#patch-share');
  await expect(page.locator('#lcd')).toHaveText('LINK COPIADO');
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/#p=1\.[A-Za-z0-9_-]+$/);
  expect(url.length).toBeLessThan(6000);
  const expected = await snapshot(page);

  const context = await browser.newContext();
  const other = await context.newPage();
  await other.addInitScript(countContexts);
  await other.goto(url);
  await expect(other.locator('#lcd')).toHaveText('PATCH LISTO · TOCÁ PLAY O UN CONTROL PARA EMPEZAR');
  await expect(other.locator('.nd')).toHaveCount(3);
  await expect(other.locator('#nd-drum')).toHaveCount(1);
  await expect(other.locator('#nd-bass')).toHaveCount(1);
  await expect(other.locator('#bv')).toHaveText('121');
  await expect(other.locator('#play')).not.toHaveClass(/on/);
  expect(await snapshot(other)).toBe(expected);
  // No audio was started, and the link is gone from the address bar.
  expect(await other.evaluate(() => (window as unknown as { __contexts: number }).__contexts)).toBe(0);
  expect(await other.evaluate(() => (window as unknown as { __mono: { level(): number } }).__mono.level())).toBe(0);
  expect(other.url()).not.toContain('#p=');
  // A fresh session: nothing was kept as "Antes del link".
  await other.click('#patch-load');
  await expect(other.locator('mono-patch-list .row')).toHaveCount(0);
  await other.click('#patch-close');
  // PLAY starts it.
  await other.click('#play');
  await expect(other.locator('mono-app')).toHaveAttribute('audio-state', 'running');
  await expect.poll(() => other.evaluate(() => (window as unknown as { __mono: { level(): number } }).__mono.level()), { timeout: 5000 }).toBeGreaterThan(0.001);
  await context.close();
});

test('un link dañado avisa y deja la sesión como estaba; uno sobre una sesión la guarda como "Antes del link"', async ({ page }) => {
  await page.goto('/');
  await addNode(page, 'drum');
  await page.waitForTimeout(1500); // autosave
  // Opened fresh with the link (a hash alone would not reload the page).
  await page.goto('about:blank');
  await page.goto('/#p=1.esto-no-es-un-patch');
  await expect(page.locator('#lcd')).toHaveText('LINK DAÑADO · SE MANTUVO LA SESIÓN');
  await expect(page.locator('.nd')).toHaveCount(2);
  await expect(page.locator('#nd-drum')).toHaveCount(1);

  // A good link over this session: the session is kept in the list first.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await addNode(page, 'synth');
  await page.click('#play');
  await page.click('#nd-master');
  await page.click('#patch-share');
  const url = await page.evaluate(() => navigator.clipboard.readText());
  await page.waitForTimeout(1500); // autosave of the session with DRUM and SYNTH
  await page.goto('about:blank');
  await page.goto(url);
  await expect(page.locator('#lcd')).toHaveText('PATCH LISTO · TOCÁ PLAY O UN CONTROL PARA EMPEZAR');
  await expect(page.locator('#play')).not.toHaveClass(/on/);
  await page.click('#patch-load');
  await expect(page.locator('mono-patch-list .nm')).toHaveText(['Antes del link']);
  await page.click('[data-open]');
  await expect(page.locator('#nd-synth')).toHaveCount(1); // the session as it was before the link
});

test('pegar un link en la misma pestaña también lo carga', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await addNode(page, 'lead');
  await page.click('#nd-master');
  await page.click('#patch-share');
  const url = await page.evaluate(() => navigator.clipboard.readText());
  await page.click('#nd-lead');
  await page.click('#rm');
  await expect(page.locator('#nd-lead')).toHaveCount(0);
  await page.evaluate((href) => {
    location.href = href;
  }, url);
  await expect(page.locator('#nd-lead')).toHaveCount(1);
  expect(page.url()).not.toContain('#p=');
});

test('IMPORT: un archivo dañado avisa y no cambia nada; uno válido carga', async ({ page }) => {
  await page.goto('/');
  await addNode(page, 'drum');
  await page.click('#nd-master');

  const [broken] = await Promise.all([page.waitForEvent('filechooser'), page.click('#patch-import')]);
  await broken.setFiles({ name: 'roto.mono', mimeType: 'application/json', buffer: Buffer.from('{"v":1,"bpm":"rapido"}') });
  await expect(page.locator('#lcd')).toHaveText('PATCH INVÁLIDO · BPM');
  await expect(page.locator('.nd')).toHaveCount(2);

  const [notJson] = await Promise.all([page.waitForEvent('filechooser'), page.click('#patch-import')]);
  await notJson.setFiles({ name: 'foto.mono', mimeType: 'text/plain', buffer: Buffer.from('<html>no</html>') });
  await expect(page.locator('#lcd')).toHaveText('ARCHIVO INVÁLIDO · NO ES UN PATCH');

  const [good] = await Promise.all([page.waitForEvent('filechooser'), page.click('#patch-import')]);
  const patch = { v: 1, name: '<b>Importado</b>', bpm: 99, nodes: ['master', 'synth'], cables: [{ from: 'synth', to: 'master' }] };
  await good.setFiles({ name: 'bueno.mono', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(patch)) });
  // The name is shown as text, never as markup.
  await expect(page.locator('#lcd')).toHaveText('IMPORTADO · <b>Importado</b>');
  await expect(page.locator('#lcd b')).toHaveCount(0);
  await expect(page.locator('#nd-synth')).toHaveCount(1);
  await expect(page.locator('#nd-drum')).toHaveCount(0);
  await expect(page.locator('#bv')).toHaveText('99');
});
