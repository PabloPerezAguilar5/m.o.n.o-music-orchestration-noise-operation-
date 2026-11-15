import { expect, test, type Page } from '@playwright/test';

/** CLEAR on the PATCH section of MASTER: empties the canvas after a second press. */

async function addNode(page: Page, id: string): Promise<void> {
  await page.click('#add');
  await page.click(`.chip[data-id="${id}"]`);
}

async function buildCanvas(page: Page): Promise<void> {
  await page.goto('/');
  await addNode(page, 'drum');
  await addNode(page, 'bass');
  await page.click('#nd-master');
  await expect(page.locator('#patch-clear')).toHaveText('CLEAR');
}

test('CLEAR dos veces vacia el lienzo y sigue vacio tras recargar', async ({ page }) => {
  await buildCanvas(page);
  await expect(page.locator('.nd')).toHaveCount(3);
  expect(await page.locator('.cb').count()).toBeGreaterThan(0);
  await page.click('#nd-master');
  await page.click('#patch-clear');
  await expect(page.locator('#patch-clear')).toHaveText('SEGURO?');
  await expect(page.locator('.nd')).toHaveCount(3); // the first press only asks
  await page.click('#patch-clear');
  await expect(page.locator('.nd')).toHaveCount(1);
  await expect(page.locator('.cb')).toHaveCount(0);
  await expect(page.locator('#nd-master')).toHaveClass(/sel/);
  await expect(page.locator('#lcd')).toHaveText('LIENZO VACÍO');
  await expect(page.locator('#play')).not.toHaveClass(/on/);
  await expect(page.locator('#patch-clear')).toHaveText('CLEAR');
  await expect(page.locator('#hint')).toBeVisible();

  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.locator('#lcd')).toBeVisible();
  await expect(page.locator('.nd')).toHaveCount(1);
  await expect(page.locator('.cb')).toHaveCount(0);
});

test('CLEAR una sola vez: pasados unos segundos vuelve a CLEAR y no borra nada', async ({ page }) => {
  await buildCanvas(page);
  await page.click('#patch-clear');
  await expect(page.locator('#patch-clear')).toHaveText('SEGURO?');
  await expect(page.locator('#patch-clear')).toHaveText('CLEAR', { timeout: 5000 });
  await expect(page.locator('.nd')).toHaveCount(3);
  // After it went back, one press asks again instead of deleting.
  await page.click('#patch-clear');
  await expect(page.locator('#patch-clear')).toHaveText('SEGURO?');
  await expect(page.locator('.nd')).toHaveCount(3);
});

test('CLEAR no toca los patches guardados', async ({ page }) => {
  await buildCanvas(page);
  await page.click('#patch-save');
  await page.fill('#patch-name', 'guardado');
  await page.press('#patch-name', 'Enter');
  await page.click('#patch-clear');
  await page.click('#patch-clear');
  await expect(page.locator('.nd')).toHaveCount(1);
  await page.click('#patch-load');
  await expect(page.locator('mono-patch-list .row')).toHaveCount(1);
  await page.click('[data-open]');
  await expect(page.locator('.nd')).toHaveCount(3);
});
