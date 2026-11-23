// Every page on desktop + mobile: loads, no console errors, no overflow, GoatCounter + privacy note + shop link present,
// all internal links resolve under the /loopwork-tools/ base path.
import path from 'node:path';
import { SHOTS, serve, launch, newPage, check, done } from './helpers.mjs';

const PAGES = ['', 'sfx/', 'resize/', 'sprites/', 'privacy.html'];
const { srv, base } = await serve();
const browser = await launch();
const seen = new Set();
for (const vp of ['desktop', 'mobile']) {
  console.log(`pages (${vp})`);
  for (const p of PAGES) {
    const { ctx, page, errors } = await newPage(browser, vp);
    const res = await page.goto(base + p, { waitUntil: 'load' });
    const label = p || 'index';
    check(res.status() === 200, `${label}: HTTP 200`);
    const info = await page.evaluate(() => ({
      gc: !!document.querySelector('script[data-goatcounter="https://loopwork.goatcounter.com/count"]'),
      privacy: /GoatCounter/.test(document.querySelector('footer')?.textContent || '') && !!document.querySelector('footer a[href$="privacy.html"], footer a[href="./"]'),
      shop: Array.from(document.querySelectorAll('a')).some((a) => a.href === 'https://loopworkgames.itch.io/' && /Loopwork SFX Pack/.test(a.textContent)),
      title: document.title, desc: document.querySelector('meta[name=description]')?.content || '',
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      links: Array.from(document.querySelectorAll('a[href], link[href], script[src], img[src]'))
        .map((e) => e.href || e.src).filter((u) => u.startsWith(location.origin)),
      absLinks: Array.from(document.querySelectorAll('a[href], link[href], script[src], img[src]'))
        .map((e) => e.getAttribute('href') || e.getAttribute('src')).filter((u) => u.startsWith('/') && !u.startsWith('//'))
    }));
    check(info.gc, `${label}: GoatCounter snippet`);
    check(info.privacy, `${label}: footer privacy note`);
    if (p !== 'privacy.html') check(info.shop, `${label}: itch.io shop link`);
    check(info.title.length > 10 && info.desc.length > 50, `${label}: title + description`);
    check(!info.overflow, `${label}: no horizontal overflow`);
    check(info.absLinks.length === 0, `${label}: only relative links` + (info.absLinks.length ? ' ' + info.absLinks : ''));
    for (const u of info.links) {
      const clean = u.split('#')[0];
      if (seen.has(clean)) continue; seen.add(clean);
      const r = await ctx.request.get(clean);
      check(r.status() === 200, `link ok: ${clean.replace(base, '/')}`);
    }
    await page.screenshot({ path: path.join(SHOTS, `page_${label.replace(/[/.]/g, '_')}_${vp}.png`), fullPage: true });
    check(errors.length === 0, `${label}: no console errors` + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }
}
for (const f of ['sitemap.xml', 'robots.txt', 'og.png', 'favicon.png', 'favicon.svg', 'LICENSE', 'README.md']) {
  const r = await fetch(base + f);
  check(r.status === 200, `static file ${f}`);
}
await browser.close(); srv.close();
done('pages');
