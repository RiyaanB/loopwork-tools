# REPORT: Loopwork Tools V2 (Job A)

Static, multi-page site in `ventures/tools/`. There's no framework or build step, and all links are relative (tested under `/loopwork-tools/`).
Target URL: https://riyaanb.github.io/loopwork-tools/. Nothing was pushed, posted or published.

## What was built

| Page | What it does |
|---|---|
| `index.html` | Landing page with cards for the 3 tools, a short "who made this" with the AI disclosure, and the shop link |
| `sfx/` | SFX generator with 10 types (the 7 from `sfx_gen.py` plus laser, pickup, blip), seed ±, pitch / length / peak dBFS / noise sliders, Randomize, Reset, WebAudio play, waveform, 16-bit WAV download, batch ZIP of N seeds (+ RECIPE.txt), and a recipe permalink in the URL hash |
| `resize/` | Cover resizer: drop / click / paste an image. Presets: itch.io cover 630×500; CrazyGames 1920×1080, 1920×1200, 800×1200; Poki 1280×720, 512×512, 204×204; Steam header 920×430, legacy 460×215, library 600×900. Plus custom W×H, cover mode (crop with focus sliders) or contain mode (pad colour or transparent), PNG or JPG with a quality setting, per-size download, "all as ZIP" or "one by one" |
| `sprites/` | Sprite slicer: slice by frame size or by rows×cols, with margin and spacing, optional skip of empty frames, grid overlay, animation preview (fps and zoom), frames JSON (x,y,w,h,col,row,duration + meta), ZIP of PNG frames + JSON, or individual PNG downloads |
| `privacy.html` | GoatCounter only, no cookies, files never leave the device |

Shared code lives in `assets/`: `sfx.js` (the synth port, CPython-compatible MT19937 and a WAV encoder), `zip.js` (a STORE ZIP writer with CRC32 and download helpers) and `style.css` (dark theme, mobile-first grid).
Other files: `README.md`, `LICENSE` (MIT, Loopwork Games), `favicon.svg/.png/.ico`, `apple-touch-icon.png`, `og.png` (1200×630, made with PIL by `scripts/make_images.py`), `sitemap.xml`, `robots.txt`, `.nojekyll`.
Every page has the GoatCounter snippet, a footer privacy note, and an AI-assistance / procedural-synthesis disclosure.
Every tool page has the shop link "Get the Loopwork SFX Pack on itch.io".

## Must update before launch
- **Shop link is a placeholder**: `https://loopworkgames.itch.io/`. Once the pack page exists, replace it with the real pack URL in `index.html`, `sfx/index.html`, `resize/index.html` and `sprites/index.html` (`grep -rn loopworkgames.itch.io`). `tests/pages.test.mjs` checks this exact URL, so update the test too.
- **Source links** point to `https://github.com/riyaanb/loopwork-tools` (inferred from the Pages URL). Check that this is the actual repo name.
- **Store sizes**: I couldn't verify them against live docs (web fetch was blocked in this session). itch 630×500 and the Steam sizes are ones I'm confident of. The CrazyGames and Poki sizes come straight from the brief. I left out the itch banner because I'm not sure of its official size, and the custom-size box covers it. The page tells users to check current platform docs. Presets are a single array at the top of `resize/app.js`.

## Notable decisions
- **Bit-exact port.** `sfx.js` reimplements CPython's `random.Random(seed)`, so at default sliders the JS output is byte-identical to WAVs written by `sfx_gen.py`. Two subtleties came up. First, the JS `**` operator rounded differently in Chrome's JIT, so it was replaced with `x*x` / `Math.pow`. Second, the Python script uses a literal 0.89 for "-1 dBFS", so `-1` maps to exactly 0.89.
- No ZIP library: the STORE method is enough for PNG/JPG/WAV, which barely compress anyway.
- Tests stub GoatCounter and fail on any other external request, so the pages make no unexpected network calls.

## Tests (headless Chrome via Playwright, desktop 1280×900 + mobile 390×844)
Run with `node tests/run-all.mjs`. Files: `tests/helpers.mjs`, `sfx.test.mjs`, `resize.test.mjs`, `sprites.test.mjs`, `pages.test.mjs`.
Screenshots and sample outputs are in `tests/shots/`. Generated fixtures are in `tests/fixtures/`.

**Latest full run: ALL TEST FILES PASSED. That's 271 checks, 0 failures** (log: `tests/last-run.log`).

- **sfx (86 checks):** The JS synth is bit-exact against `sfx_gen.py` for 7 types × seeds {1, 2, 3, 12345}, both in Node and inside Chrome (with repeats so JIT-compiled code is covered too). All 10 types are deterministic and peak at 0.89. The exported WAV header is RIFF/PCM, mono, 44100 Hz, 16-bit, and the length matches exactly (explode = 30,869 samples). The downloaded file is byte-identical to the WAV that `sfx_gen.py` writes. The length slider at ×2 doubles the samples. All 10 types export. Randomize plus the recipe link round-trips. The batch ZIP holds 5 WAVs + RECIPE.txt.
- **resize (58):** A generated 1600×1000 image is exported to all 10 presets + a custom 960×540 as individual PNGs. Every size is verified from the file header. The same is done as JPG in contain mode via the ZIP. A pixel check confirms the cover-mode crop focus.
- **sprites (28):** A generated 4×2 sheet (24×32 frames, margin 2, spacing 3, one empty cell) gives 7 frames with exact rects. Rows×cols mode matches frame-size mode. The empty cell is kept when "skip empty" is off. The animation advances. The JSON names, meta and duration are correct. The ZIP has 7 PNGs at 24×32 + JSON. A pixel check shows each frame comes from the right cell. The individual PNG download works.
- **pages (99):** All 5 pages on both viewports return HTTP 200 with no console errors and no horizontal overflow. Each has the GoatCounter snippet, the footer privacy note, the shop link, a title and a description, and uses only relative links. Every internal link and asset resolves under `/loopwork-tools/`. Static files (sitemap, robots, og, favicon, LICENSE, README) are served.
- Every check, including "no console errors", ran on both desktop and mobile viewports.

**Bugs found and fixed while testing:** Chrome's JIT `**` rounding broke bit-exactness (fixed). "-1 dB" meant 0.8913 instead of the reference's 0.89 (fixed). The `[hidden]` attribute was overridden by `.row{display:flex}`, so both slicing modes' inputs showed at once (fixed, and now covered by a test).

**Flakiness note:** the machine was under heavy load from other jobs (load average 35–50 on 8 cores). Two earlier runs hit timing-based failures: a 15 s download wait and a 250 ms animation wait. The test waits are now 60 s and up to 5 s, and the latest full run passed. These were timing issues in the tests, not app bugs.

Not tested: actual audio output (headless Chrome has no speakers; the test only checks that Play runs without errors), real drag-and-drop (the tests load files through the file input, which uses the same code path), and real iOS/Safari devices.
