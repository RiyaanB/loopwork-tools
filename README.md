# Loopwork Tools

Free, single-page browser tools for indie game developers, made by Loopwork Games.

- **`/sfx/`**: retro sound effect generator. It has 10 types (coin, jump, hit, explosion, power-up, UI click, whoosh, laser, pickup and blip), with seed, pitch, length, peak level and noise controls. It exports 16-bit mono 44.1 kHz WAV, or a batch of seeds as a ZIP.
- **`/resize/`**: cover and thumbnail resizer with presets for itch.io, CrazyGames, Poki and Steam, plus custom sizes. It does cover (crop with a focus point) or contain (pad) fits and outputs PNG/JPG, one file at a time or as a ZIP.
- **`/sprites/`**: sprite sheet slicer. Slice by frame size or by rows × columns, with margin and spacing, and skip empty frames if you like. It shows a live animation preview and exports frame JSON plus PNG frames, individually or as a ZIP.

Live site: https://riyaanb.github.io/loopwork-tools/

## How it's built

Plain HTML, CSS and JavaScript. There's no framework, no build step and no dependencies. Everything runs client-side and no file is ever uploaded.
All links are relative, so the site works from any sub-path (GitHub Pages project sites included).

```
index.html            landing page
sfx/ resize/ sprites/ one folder per tool (index.html + app.js)
assets/sfx.js         the synth (seeded, deterministic), plus WAV encoder
assets/zip.js         tiny STORE-only ZIP writer + download helpers
assets/style.css      shared dark theme
privacy.html          what is (and isn't) collected
scripts/make_images.py  regenerates favicon.png / favicon.ico / apple-touch-icon.png / og.png (needs Pillow)
tests/                headless Chromium tests (Playwright) + screenshots in tests/shots/
```

### The synth

`assets/sfx.js` is a JavaScript port of the Python script we use to build the Loopwork SFX Pack. It reimplements
CPython's Mersenne Twister seeding, so with sliders at their defaults the 7 original types (coin, jump, hit, explode,
powerup, click, whoosh) produce **bit-identical** WAV files to the Python version. The tests check this in Node and
in Chrome. Laser, pickup and blip are additions that exist only in the JS version.

Every sound is synthesized procedurally from oscillators, filtered noise and envelopes. No samples or recordings are used.
Sounds you generate are yours to use in any project, with no credit required.

## Running locally

Any static file server works, e.g. `python3 -m http.server` in this folder, then open http://localhost:8000/.

## Tests

```
node tests/run-all.mjs
```

The tests serve the folder under `/loopwork-tools/` (the same as on GitHub Pages) and drive headless Chrome at desktop and mobile
sizes. GoatCounter is stubbed, so tests make no network requests. They need Playwright and Python 3 with Pillow. Edit the
`import` path in `tests/helpers.mjs` if Playwright lives elsewhere on your machine.

## Analytics and privacy

Page views are counted with GoatCounter, which sets no cookies. See `privacy.html`.

## Disclosure

The code and page copy were written with AI assistance. Loopwork Games is a small studio where AI agents do much of the work.

## License

MIT. See `LICENSE`.
