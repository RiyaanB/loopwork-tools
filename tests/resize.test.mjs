// Cover resizer: load a generated sample image, export every preset (PNG individually, JPG via ZIP), verify dimensions.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SHOTS, FIXTURES, serve, launch, newPage, download, imageSize, unzipStore, check, done } from './helpers.mjs';

const sample = path.join(FIXTURES, 'sample_1600x1000.png');
execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
im = Image.new('RGB', (1600, 1000), (30, 40, 70)); d = ImageDraw.Draw(im)
for i in range(0, 1600, 100): d.line([(i, 0), (i, 1000)], fill=(60, 80, 120), width=2)
d.ellipse([650, 350, 950, 650], fill=(255, 181, 71)); d.rectangle([0, 0, 199, 199], fill=(90, 209, 199))
im.save(${JSON.stringify(sample)})`]);

const { srv, base } = await serve();
const browser = await launch();
for (const vp of ['desktop', 'mobile']) {
  console.log(`resize: browser (${vp})`);
  const { ctx, page, errors } = await newPage(browser, vp);
  await page.goto(base + 'resize/', { waitUntil: 'load' });
  await page.click('#allOn');
  await page.fill('#cw', '960'); await page.fill('#ch', '540'); await page.click('#addCustom');
  await page.setInputFiles('#file', sample);
  await page.waitForFunction(() => document.querySelectorAll('#thumbs .thumb').length > 0);
  await page.waitForTimeout(200);
  const presets = await page.evaluate(() => window.__resize.PRESETS.map((p) => ({ id: p.id, w: p.w, h: p.h })));
  check(presets.length === 11, `${presets.length} presets incl. custom`);
  check((await page.locator('#thumbs .thumb').count()) === presets.length, 'a preview per preset');
  check((await page.textContent('#srcInfo')).includes('1600×1000'), 'source dimensions shown');

  // each preset individually as PNG (cover mode)
  for (const p of presets) {
    const { name, bytes } = await download(page, () => page.click(`.thumb[data-preset="${p.id}"] button`));
    const s = imageSize(bytes);
    check(s.type === 'png' && s.w === p.w && s.h === p.h, `PNG ${name}: ${s.w}×${s.h}`);
  }

  // contain mode + JPG, all in one ZIP
  await page.click('[data-mode="contain"]');
  await page.selectOption('#format', 'image/jpeg');
  await page.waitForTimeout(200);
  const { name, bytes } = await download(page, () => page.click('#zipAll'));
  const entries = unzipStore(bytes);
  check(entries.length === presets.length, `ZIP ${name} has ${entries.length} files`);
  for (const p of presets) {
    const e = entries.find((x) => x.name.includes('_' + p.id + '_'));
    const s = e && imageSize(e.data);
    check(s && s.type === 'jpg' && s.w === p.w && s.h === p.h, `JPG in ZIP ${p.id}: ${s ? s.w + '×' + s.h : 'missing'}`);
    if (vp === 'desktop' && e && p.id === 'cg-portrait') fs.writeFileSync(path.join(SHOTS, 'resize_contain_portrait.jpg'), e.data);
  }

  // cover crop correctness: with focus 0,0 the top-left teal square must be in the corner of the square output
  await page.click('[data-mode="cover"]');
  await page.selectOption('#format', 'image/png');
  await page.locator('#fx').fill('0'); await page.locator('#fy').fill('0');
  await page.waitForTimeout(200);
  const px = await page.evaluate(() => {
    const c = document.querySelector('.thumb[data-preset="poki-square"] canvas');
    return Array.from(c.getContext('2d').getImageData(5, 5, 1, 1).data);
  });
  check(Math.abs(px[0] - 90) < 12 && Math.abs(px[1] - 209) < 12, `cover focus top-left keeps the corner content (${px.slice(0, 3)})`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'no horizontal overflow');
  await page.screenshot({ path: path.join(SHOTS, `resize_${vp}.png`), fullPage: true });
  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}
await browser.close(); srv.close();
done('resize');
