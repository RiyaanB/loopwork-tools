/* Loopwork cover & thumbnail resizer. Depends on ../assets/zip.js */
(function () {
  'use strict';
  var Z = window.LoopworkZip;
  var $ = function (id) { return document.getElementById(id); };

  // Edit here when a platform changes its requirements.
  var PRESETS = [
    { id: 'itch-cover', group: 'itch.io', name: 'Cover image', w: 630, h: 500, on: true },
    { id: 'cg-landscape', group: 'CrazyGames', name: 'Landscape cover', w: 1920, h: 1080, on: true },
    { id: 'cg-wide', group: 'CrazyGames', name: '16:10 cover', w: 1920, h: 1200, on: false },
    { id: 'cg-portrait', group: 'CrazyGames', name: 'Portrait cover', w: 800, h: 1200, on: true },
    { id: 'poki-large', group: 'Poki', name: 'Thumbnail, landscape', w: 1280, h: 720, on: false },
    { id: 'poki-square', group: 'Poki', name: 'Thumbnail, square', w: 512, h: 512, on: false },
    { id: 'poki-small', group: 'Poki', name: 'Thumbnail, small', w: 204, h: 204, on: false },
    { id: 'steam-header', group: 'Steam', name: 'Header capsule', w: 920, h: 430, on: false },
    { id: 'steam-header-legacy', group: 'Steam', name: 'Header capsule (older 1x size)', w: 460, h: 215, on: false },
    { id: 'steam-library', group: 'Steam', name: 'Library capsule', w: 600, h: 900, on: false }
  ];
  var opt = { mode: 'cover', fx: 0.5, fy: 0.5, bg: '#000000', transparent: false, format: 'image/png', quality: 0.92 };
  var src = null, srcName = 'cover';

  // ---- preset table ----
  function renderPresets() {
    var tb = $('presetRows'); tb.innerHTML = '';
    PRESETS.forEach(function (p) {
      var tr = document.createElement('tr');
      var id = 'p-' + p.id;
      tr.innerHTML = '<td><input type="checkbox" id="' + id + '"' + (p.on ? ' checked' : '') + '></td>' +
        '<td><label for="' + id + '" style="color:var(--text)">' + esc(p.group) + ' · ' + esc(p.name) + '</label></td>' +
        '<td class="muted" style="white-space:nowrap">' + p.w + '×' + p.h + '</td>';
      tr.querySelector('input').addEventListener('change', function () { p.on = this.checked; renderAll(); });
      tb.appendChild(tr);
    });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- loading ----
  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) { status('That file is not an image.', true); return; }
    srcName = (file.name || 'cover').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 60) || 'cover';
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      src = img;
      $('srcInfo').textContent = (file.name || 'pasted image') + ': ' + img.naturalWidth + '×' + img.naturalHeight + ' px';
      status(''); renderAll();
    };
    img.onerror = function () { status('Could not read that image. Try PNG, JPG or WebP.', true); URL.revokeObjectURL(url); };
    img.src = url;
  }
  var drop = $('drop');
  drop.addEventListener('click', function () { $('file').click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
  $('file').addEventListener('change', function () { loadFile(this.files[0]); this.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });
  document.addEventListener('paste', function (e) {
    var items = (e.clipboardData || {}).items || [];
    for (var i = 0; i < items.length; i++) if (items[i].kind === 'file') { loadFile(items[i].getAsFile()); break; }
  });

  // ---- drawing ----
  // Downscale in halving steps for big reductions (smoother than one bilinear pass).
  function stepDown(img, sx, sy, sw, sh, dw, dh) {
    var cur = img, cx = sx, cy = sy, cw = sw, chh = sh;
    while (cw / 2 >= dw && chh / 2 >= dh) {
      var nw = Math.round(cw / 2), nh = Math.round(chh / 2);
      var c = document.createElement('canvas'); c.width = nw; c.height = nh;
      var g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      g.drawImage(cur, cx, cy, cw, chh, 0, 0, nw, nh);
      cur = c; cx = 0; cy = 0; cw = nw; chh = nh;
    }
    return { img: cur, sx: cx, sy: cy, sw: cw, sh: chh };
  }
  function renderPreset(p) {
    var c = document.createElement('canvas'); c.width = p.w; c.height = p.h;
    var g = c.getContext('2d');
    var iw = src.naturalWidth, ih = src.naturalHeight;
    var paintBg = opt.mode === 'contain' && !(opt.transparent && opt.format === 'image/png');
    if (opt.format === 'image/jpeg' || paintBg) { g.fillStyle = opt.mode === 'contain' ? opt.bg : '#000'; g.fillRect(0, 0, p.w, p.h); }
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    if (opt.mode === 'cover') {
      var s = Math.max(p.w / iw, p.h / ih), sw = p.w / s, sh = p.h / s;
      var sx = (iw - sw) * opt.fx, sy = (ih - sh) * opt.fy;
      var st = stepDown(src, sx, sy, sw, sh, p.w, p.h);
      g.drawImage(st.img, st.sx, st.sy, st.sw, st.sh, 0, 0, p.w, p.h);
    } else {
      var k = Math.min(p.w / iw, p.h / ih), dw = Math.round(iw * k), dh = Math.round(ih * k);
      var st2 = stepDown(src, 0, 0, iw, ih, dw, dh);
      g.drawImage(st2.img, st2.sx, st2.sy, st2.sw, st2.sh, Math.floor((p.w - dw) / 2), Math.floor((p.h - dh) / 2), dw, dh);
    }
    return c;
  }
  function ext() { return opt.format === 'image/jpeg' ? 'jpg' : 'png'; }
  function fileFor(p) { return srcName + '_' + p.id + '_' + p.w + 'x' + p.h + '.' + ext(); }
  function selected() { return PRESETS.filter(function (p) { return p.on; }); }

  var rendered = {};
  var timer = 0;
  function renderAll() { clearTimeout(timer); timer = setTimeout(renderNow, 60); }
  function renderNow() {
    var box = $('thumbs'); box.innerHTML = ''; rendered = {};
    var sel = selected();
    $('zipAll').disabled = $('eachAll').disabled = !src || !sel.length;
    if (!src) { box.innerHTML = '<p class="muted small">Load an image to see previews.</p>'; return; }
    if (!sel.length) { box.innerHTML = '<p class="muted small">Tick at least one size.</p>'; return; }
    sel.forEach(function (p) {
      var c = renderPreset(p); rendered[p.id] = c;
      var d = document.createElement('div'); d.className = 'thumb'; d.dataset.preset = p.id;
      var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Download';
      b.style.cssText = 'width:100%;margin-top:6px;min-height:34px;padding:4px';
      b.addEventListener('click', function () { downloadOne(p); });
      var m = document.createElement('div'); m.className = 'meta';
      m.innerHTML = '<span>' + esc(p.group) + '</span><span>' + p.w + '×' + p.h + '</span>';
      d.appendChild(c); d.appendChild(m); d.appendChild(b); box.appendChild(d);
    });
  }
  function bytesFor(p) { return Z.canvasToBytes(rendered[p.id] || renderPreset(p), opt.format, opt.quality); }
  function downloadOne(p) {
    return bytesFor(p).then(function (b) { Z.downloadBlob(new Blob([b], { type: opt.format }), fileFor(p)); });
  }
  $('zipAll').addEventListener('click', function () {
    var sel = selected(); status('Building ZIP…');
    Promise.all(sel.map(function (p) { return bytesFor(p).then(function (b) { return { name: fileFor(p), data: b }; }); }))
      .then(function (files) { Z.downloadBlob(Z.makeZip(files), srcName + '_store_images.zip'); status('Saved ZIP with ' + files.length + ' images.'); })
      .catch(function (e) { status('Export failed: ' + e.message, true); });
  });
  $('eachAll').addEventListener('click', function () {
    var sel = selected(), i = 0;
    (function next() {
      if (i >= sel.length) { status('Saved ' + sel.length + ' images. If your browser asks to allow multiple downloads, say yes.'); return; }
      downloadOne(sel[i++]).then(function () { setTimeout(next, 250); });
    })();
  });

  // ---- options ----
  Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
    b.addEventListener('click', function () {
      opt.mode = b.dataset.mode;
      Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      $('focusBox').hidden = opt.mode !== 'cover'; $('padBox').hidden = opt.mode !== 'contain';
      renderAll();
    });
  });
  $('fx').addEventListener('input', function () { opt.fx = +this.value; $('fxVal').textContent = Math.round(opt.fx * 100) + '%'; renderAll(); });
  $('fy').addEventListener('input', function () { opt.fy = +this.value; $('fyVal').textContent = Math.round(opt.fy * 100) + '%'; renderAll(); });
  $('bg').addEventListener('input', function () { opt.bg = this.value; renderAll(); });
  $('transparent').addEventListener('change', function () { opt.transparent = this.checked; renderAll(); });
  $('format').addEventListener('change', function () { opt.format = this.value; $('qualityBox').hidden = opt.format !== 'image/jpeg'; renderAll(); });
  $('quality').addEventListener('input', function () { opt.quality = +this.value / 100; $('qualityVal').textContent = this.value; });
  $('allOn').addEventListener('click', function () { PRESETS.forEach(function (p) { p.on = true; }); renderPresets(); renderAll(); });
  $('allOff').addEventListener('click', function () { PRESETS.forEach(function (p) { p.on = false; }); renderPresets(); renderAll(); });
  $('addCustom').addEventListener('click', function () {
    var w = Math.floor(+$('cw').value), h = Math.floor(+$('ch').value);
    if (!(w >= 1 && h >= 1 && w <= 8192 && h <= 8192)) { status('Custom size must be between 1 and 8192 px on each side.', true); return; }
    PRESETS.push({ id: 'custom-' + w + 'x' + h + '-' + PRESETS.length, group: 'Custom', name: w + '×' + h, w: w, h: h, on: true });
    renderPresets(); renderAll(); status('');
  });
  function status(msg, err) { var s = $('status'); s.textContent = msg || ''; s.className = 'status' + (err ? ' err' : ''); }

  renderPresets(); renderNow();
  window.__resize = { PRESETS: PRESETS, opt: opt, loadFile: loadFile }; // for tests / console
})();
