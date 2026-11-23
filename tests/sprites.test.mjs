// Sprite slicer: generate a test sheet with margin/spacing and an empty cell, slice it both ways, verify JSON + PNG exports.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SHOTS, FIXTURES, serve, launch, newPage, download, imageSize, unzipStore, check, done } from './helpers.mjs';

// 4 cols × 2 rows of 24×32 frames, margin 2, spacing 3; last cell left transparent => 7 real frames.
const sheet = path.join(FIXTURES, 'sheet_4x2_24x32_m2_s3.png');
const FW = 24, FH = 32, M = 2, SP = 3, COLS = 4, ROWS = 2;
execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
W = 2*${M} + ${COLS}*${FW} + (${COLS}-1)*${SP}; H = 2*${M} + ${ROWS}*${FH} + (${ROWS}-1)*${SP}
im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
n = 0
for r in range(${ROWS}):
  for c in range(${COLS}):
    if r == ${ROWS}-1 and c == ${COLS}-1: continue
    x = ${M} + c*(${FW}+${SP}); y = ${M} + r*(${FH}+${SP})
    d.rectangle([x, y, x+${FW}-1, y+${FH}-1], fill=(40 + n*25, 120, 200, 255))
    d.rectangle([x+4, y+4+n*2, x+12, y+12+n*2], fill=(255, 181, 71, 255))  # moving "ball"
    n += 1
im.save(${JSON.stringify(sheet)})`]);

const { srv, base } = await serve();
const browser = await launch();
for (const vp of ['desktop', 'mobile']) {
  console.log(`sprites: browser (${vp})`);
  const { ctx, page, errors } = await newPage(browser, vp);
  await page.goto(base + 'sprites/', { waitUntil: 'load' });
  await page.setInputFiles('#file', sheet);
  await page.waitForFunction(() => window.__sprites.frames.length > 0);

  // by frame size
  for (const [id, v] of [['fw', FW], ['fh', FH], ['margin', M], ['spacing', SP]]) await page.fill('#' + id, String(v));
  let frames = await page.evaluate(() => window.__sprites.frames.map((f) => ({ ...f })));
  check(frames.length === 7, `frame-size mode: ${frames.length} frames (empty cell skipped)`);
  const expect = (i) => ({ x: M + (i % COLS) * (FW + SP), y: M + Math.floor(i / COLS) * (FH + SP) });
  check(frames.every((f, i) => f.x === expect(i).x && f.y === expect(i).y && f.w === FW && f.h === FH), 'frame rectangles match the generated layout');

  // by rows × cols gives the same result
  await page.click('[data-by="count"]');
  await page.fill('#cols', String(COLS)); await page.fill('#rows', String(ROWS));
  check(!(await page.isVisible('#bySize')) && (await page.isVisible('#byCount')), 'only the active slicing inputs are visible');
  const frames2 = await page.evaluate(() => window.__sprites.frames.map((f) => ({ ...f })));
  check(JSON.stringify(frames2) === JSON.stringify(frames), 'rows×cols mode gives identical frames');

  // include empty frame when unchecked
  await page.uncheck('#skipEmpty');
  check((await page.evaluate(() => window.__sprites.frames.length)) === 8, 'unchecking "skip empty" keeps all 8 cells');
  await page.check('#skipEmpty');

  // animation advances
  await page.fill('#fps', '30'); await page.locator('#fps').dispatchEvent('input');
  const t1 = await page.textContent('#frameNo');
  await page.waitForFunction((t) => document.getElementById('frameNo').textContent !== t, t1, { timeout: 5000 }).catch(() => {});
  const t2 = await page.textContent('#frameNo');
  check(t1 !== t2 && /frame \d+ \/ 7/.test(t2), `animation preview advances (${t1} → ${t2})`);

  // JSON export
  await page.fill('#name', 'hero_run');
  let { name, bytes } = await download(page, () => page.click('#dlJson'));
  const j = JSON.parse(bytes.toString('utf8'));
  check(name === 'hero_run_frames.json' && j.frames.length === 7 && j.frames[0].name === 'hero_run_00' && j.frames[6].x === expect(6).x,
    `JSON ${name}: ${j.frames.length} frames, first ${j.frames[0].name}`);
  check(j.meta.size.w === 2 * M + COLS * FW + (COLS - 1) * SP && j.meta.spacing === SP && j.frames[0].duration === Math.round(1000 / 30), 'JSON meta (size, spacing, duration)');

  // ZIP of PNG frames
  ({ name, bytes } = await download(page, () => page.click('#dlZip')));
  const entries = unzipStore(bytes);
  const pngs = entries.filter((e) => e.name.endsWith('.png'));
  check(pngs.length === 7 && pngs.every((e) => { const s = imageSize(e.data); return s.w === FW && s.h === FH; }), `ZIP ${name}: 7 PNG frames at ${FW}×${FH}`);
  check(entries.some((e) => e.name === 'hero_run_frames.json'), 'ZIP includes the JSON');
  if (vp === 'desktop') fs.writeFileSync(path.join(SHOTS, 'sprites_frame_03.png'), pngs[3].data);

  // pixel check: frame 3's "ball" is at the expected offset inside the exported PNG
  const okPixel = await page.evaluate(async (b64) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const ball = g.getImageData(8, 8 + 3 * 2, 1, 1).data, bg = g.getImageData(20, 28, 1, 1).data;
    return ball[0] === 255 && ball[1] === 181 && bg[0] === 40 + 3 * 25 && bg[3] === 255;
  }, pngs[3].data.toString('base64'));
  check(okPixel, 'exported frame pixels come from the right cell');

  // individual PNG downloads (first one is enough to prove the path works; all are triggered)
  const first = await download(page, () => page.click('#dlEach'));
  const s = imageSize(first.bytes);
  check(first.name === 'hero_run_00.png' && s.w === FW && s.h === FH, `individual PNG download ${first.name} ${s.w}×${s.h}`);
  await page.waitForTimeout(1800);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'no horizontal overflow');
  await page.screenshot({ path: path.join(SHOTS, `sprites_${vp}.png`), fullPage: true });
  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}
await browser.close(); srv.close();
done('sprites');
