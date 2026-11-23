// Shared test helpers: static server, browser setup, file-format parsers.
import { chromium } from '/home/box/swarm/side-gig/games/triangulate/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TESTS = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.dirname(TESTS);
export const SHOTS = path.join(TESTS, 'shots');
export const FIXTURES = path.join(TESTS, 'fixtures');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FIXTURES, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json' };

// Serves ROOT under /loopwork-tools/ to mimic the GitHub Pages project path (catches absolute-link bugs).
export function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!u.startsWith('/loopwork-tools/')) { res.writeHead(404); return res.end('outside base'); }
      let p = path.join(ROOT, u.slice('/loopwork-tools/'.length));
      if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}/loopwork-tools/` }));
  });
}

export const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};

export async function launch() {
  return chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'] });
}

// New page with console/page-error capture; GoatCounter is stubbed so tests never hit the network.
export async function newPage(browser, vp = 'desktop') {
  const ctx = await browser.newContext({ ...VIEWPORTS[vp], acceptDownloads: true });
  const errors = [], gcRequests = [];
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes('gc.zgo.at') || u.includes('goatcounter.com')) {
      gcRequests.push(u);
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* goatcounter stub */' });
    }
    if (!u.startsWith('http://127.0.0.1') && !u.startsWith('blob:') && !u.startsWith('data:')) {
      errors.push('unexpected network request: ' + u);
      return route.abort();
    }
    return route.continue();
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return { ctx, page, errors, gcRequests };
}

export async function download(page, action) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), action()]);
  const p = await dl.path();
  return { name: dl.suggestedFilename(), bytes: fs.readFileSync(p) };
}

// ---- parsers ----
export function parseWav(b) {
  const s = (o, n) => b.toString('ascii', o, o + n);
  if (s(0, 4) !== 'RIFF' || s(8, 4) !== 'WAVE' || s(12, 4) !== 'fmt ' || s(36, 4) !== 'data') throw new Error('bad WAV header');
  return { riffSize: b.readUInt32LE(4), fmt: b.readUInt16LE(20), channels: b.readUInt16LE(22), rate: b.readUInt32LE(24),
    byteRate: b.readUInt32LE(28), blockAlign: b.readUInt16LE(32), bits: b.readUInt16LE(34), dataLen: b.readUInt32LE(40),
    samples: b.readUInt32LE(40) / 2, fileLen: b.length };
}
export function imageSize(b) {
  if (b.readUInt32BE(0) === 0x89504e47) return { type: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const m = b[o + 1], len = b.readUInt16BE(o + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { type: 'jpg', h: b.readUInt16BE(o + 5), w: b.readUInt16BE(o + 7) };
      o += 2 + len;
    }
  }
  throw new Error('unknown image format');
}
export function unzipStore(b) {
  const out = [];
  let o = 0;
  while (b.readUInt32LE(o) === 0x04034b50) {
    const method = b.readUInt16LE(o + 8), size = b.readUInt32LE(o + 18), nl = b.readUInt16LE(o + 26), xl = b.readUInt16LE(o + 28);
    if (method !== 0) throw new Error('unexpected compression');
    const name = b.toString('utf8', o + 30, o + 30 + nl), start = o + 30 + nl + xl;
    out.push({ name, data: b.subarray(start, start + size) });
    o = start + size;
  }
  if (b.readUInt32LE(b.length - 22) !== 0x06054b50) throw new Error('no end-of-central-directory');
  if (b.readUInt16LE(b.length - 22 + 10) !== out.length) throw new Error('EOCD entry count mismatch');
  return out;
}

let failures = 0;
export function check(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else { failures++; console.log('  FAIL ' + msg); }
}
export function done(name) {
  console.log(failures ? `${name}: ${failures} failure(s)` : `${name}: all passed`);
  process.exitCode = failures ? 1 : 0;
  return failures;
}
