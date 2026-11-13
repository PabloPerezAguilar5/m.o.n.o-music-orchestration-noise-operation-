import { test } from '@playwright/test';
for (const vp of [{ w: 1280, h: 720 }, { w: 844, h: 390 }]) {
  test(`measure ${vp.w}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:5173/');
    await page.click('#add'); await page.click('.chip[data-id="drum"]'); await page.click('#play');
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const panel = document.querySelector('mono-app')!.shadowRoot!.querySelector('mono-panel')!.shadowRoot!;
      const box = (s: string) => { const e = panel.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
      return { kr: box('.kr'), pattern: box('section[data-section="pattern"]'), macro: box('.kr section:last-child'), zn: box('.zn'), plate: box('.plate') };
    });
    console.log(vp.w, JSON.stringify(r));
    await page.screenshot({ path: `C:/Users/pablo/AppData/Local/Temp/claude/0de5177cbb4e6210/39da67af-5825-419a-83eb-4dc59ad7a67e/scratchpad/drum-${vp.w}.png` });
    await ctx.close();
  });
}
