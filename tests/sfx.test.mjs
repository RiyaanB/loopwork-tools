// SFX generator: Python parity (node), then browser UI + WAV export checks on desktop and mobile.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, SHOTS, FIXTURES, serve, launch, newPage, download, parseWav, unzipStore, check, done } from './helpers.mjs';

console.log('sfx: parity with devshop/sfx_gen.py');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/sfx.js'), 'utf8'), ctx);
const S = ctx.LoopworkSFX;
const PY_TYPES = ['coin', 'jump', 'hit', 'explode', 'powerup', 'click', 'whoosh'];
const ref = JSON.parse(execFileSync('python3', ['-c', `
import sys, json; sys.path.insert(0, '/home/box/swarm/side-gig/ventures/devshop'); import sfx_gen
print(json.dumps({k+':'+str(s): [int(x*32767) for x in sfx_gen.synth(k, s)] for k in ${JSON.stringify(PY_TYPES)} for s in (1, 2, 3, 12345)}))
`], { maxBuffer: 1 << 28 }).toString());
for (const key of Object.keys(ref)) {
  const [k, s] = key.split(':');
  const q = S.toInt16(S.synth(k, +s));
  let diff = 0; for (let i = 0; i < q.length; i++) if (q[i] !== ref[key][i]) diff++;
  check(q.length === ref[key].length && diff === 0, `${key} bit-exact vs Python (${q.length} samples, ${diff} diffs)`);
}
for (const k of Object.keys(S.TYPES)) {
  const a = S.synth(k, 7), b = S.synth(k, 7);
  const peak = Math.max(...Array.from(a, Math.abs));
  check(a.length === Math.trunc(44100 * S.TYPES[k].dur) && a.every((v, i) => v === b[i]) && Math.abs(peak - 0.89) < 1e-9,
    `${k}: deterministic, length ${a.length}, peak -1 dBFS`);
}

const { srv, base } = await serve();
const browser = await launch();
for (const vp of ['desktop', 'mobile']) {
  console.log(`sfx: browser (${vp})`);
  const { ctx: bctx, page, errors, gcRequests } = await newPage(browser, vp);
  await page.goto(base + 'sfx/', { waitUntil: 'load' });
  check((await page.locator('#types button').count()) === 10, '10 sound type buttons');
  check(gcRequests.length > 0, 'GoatCounter script requested (stubbed)');
  // parity inside the real browser engine too (JIT can round differently from node's run)
  const bad = await page.evaluate((ref) => {
    const out = [];
    for (let rep = 0; rep < 3; rep++) for (const key of Object.keys(ref)) { // repeat so hot JIT-compiled code is tested too
      const [k, s] = key.split(':');
      const q = LoopworkSFX.toInt16(LoopworkSFX.synth(k, +s));
      let d = 0; for (let i = 0; i < q.length; i++) if (q[i] !== ref[key][i]) d++;
      if (d || q.length !== ref[key].length) out.push(`${key}#${rep}:${d}`);
    }
    return out;
  }, ref);
  check(bad.length === 0, 'in-browser synth bit-exact vs Python for all 28 type/seed cases' + (bad.length ? ': ' + bad.join(',') : ''));

  // pick explosion, seed 3, play
  await page.click('#types button[data-type="explode"]');
  await page.fill('#seed', '3'); await page.press('#seed', 'Enter'); await page.locator('#seed').blur();
  await page.click('#play');
  await page.waitForTimeout(150);
  const acState = await page.evaluate(() => typeof AudioContext !== 'undefined');
  check(acState, 'Web Audio available and play clicked without error');

  let { name, bytes } = await download(page, () => page.click('#download'));
  let w = parseWav(bytes);
  const expected = Math.trunc(44100 * 0.7);
  check(name === 'loopwork_explode_003.wav', `download name ${name}`);
  check(w.fmt === 1 && w.channels === 1 && w.rate === 44100 && w.bits === 16 && w.blockAlign === 2 && w.byteRate === 88200, 'WAV header: PCM mono 44.1k 16-bit');
  check(w.samples === expected && w.fileLen === 44 + expected * 2 && w.riffSize === w.fileLen - 8, `WAV length ${w.samples} samples (expected ${expected})`);
  // file must equal what the node port produces (and therefore Python)
  const pcm = S.toInt16(S.synth('explode', 3));
  check(Buffer.from(S.encodeWav(pcm)).equals(bytes), 'downloaded WAV byte-identical to reference synth output');
  const pyWav = path.join(FIXTURES, 'py_explode_03.wav');
  if (!fs.existsSync(pyWav)) execFileSync('python3', ['-c', `import sys; sys.path.insert(0, '/home/box/swarm/side-gig/ventures/devshop'); import sfx_gen; sfx_gen.write(${JSON.stringify(pyWav)}, sfx_gen.synth('explode', 3))`]);
  check(fs.readFileSync(pyWav).equals(bytes), 'downloaded WAV byte-identical to the WAV written by sfx_gen.py');
  if (vp === 'desktop') fs.writeFileSync(path.join(SHOTS, 'sample_explode_003.wav'), bytes);

  // sliders change output length
  await page.locator('#length').fill('2');
  await page.locator('#length').dispatchEvent('change');
  ({ bytes } = await download(page, () => page.click('#download')));
  w = parseWav(bytes);
  check(w.samples === Math.trunc(44100 * 0.7 * 2), `length ×2 → ${w.samples} samples`);
  await page.click('#reset');

  // every type exports a valid WAV
  for (const k of Object.keys(S.TYPES)) {
    await page.click(`#types button[data-type="${k}"]`);
    ({ bytes } = await download(page, () => page.click('#download')));
    w = parseWav(bytes);
    check(w.samples === Math.trunc(44100 * S.TYPES[k].dur), `${k}: WAV ${w.samples} samples`);
  }

  // randomize then permalink round-trip
  await page.click('#randomize');
  const st = await page.evaluate(() => ({ ...window.__sfx.state }));
  const href = await page.getAttribute('#permalink', 'href');
  const p2 = await bctx.newPage();
  await p2.goto(base + 'sfx/' + href);
  const st2 = await p2.evaluate(() => ({ ...window.__sfx.state }));
  check(JSON.stringify(st) === JSON.stringify(st2), 'randomize + recipe link restores identical settings');
  await p2.close();

  // batch ZIP
  await page.fill('#batchN', '5');
  ({ name, bytes } = await download(page, () => page.click('#batch')));
  const entries = unzipStore(bytes);
  check(entries.length === 6 && entries.filter((e) => e.name.endsWith('.wav')).every((e) => parseWav(e.data).bits === 16),
    `batch ZIP ${name}: 5 WAVs + recipe`);

  await page.evaluate(() => window.scrollTo(0, 0));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'no horizontal overflow');
  await page.screenshot({ path: path.join(SHOTS, `sfx_${vp}.png`), fullPage: true });
  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await bctx.close();
}
await browser.close(); srv.close();
done('sfx');
