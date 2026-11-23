/* Loopwork sprite sheet slicer. Depends on ../assets/zip.js */
(function () {
  'use strict';
  var Z = window.LoopworkZip;
  var $ = function (id) { return document.getElementById(id); };
  var img = null, srcName = 'sheet', fileName = '', by = 'size', frames = [], fi = 0, playingAnim = true, lastT = 0;
  var srcCanvas = document.createElement('canvas'), srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });

  function int(id, min) { var v = Math.floor(+$(id).value); return isFinite(v) ? Math.max(min, v) : min; }
  function status(msg, err) { var s = $('status'); s.textContent = msg || ''; s.className = 'status' + (err ? ' err' : ''); }
  function prefix() { return ($('name').value || 'sprite').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'sprite'; }

  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) { status('That file is not an image.', true); return; }
    fileName = file.name || 'sheet.png';
    srcName = fileName.replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_') || 'sheet';
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      img = im;
      srcCanvas.width = im.naturalWidth; srcCanvas.height = im.naturalHeight;
      srcCtx.clearRect(0, 0, srcCanvas.width, srcCanvas.height); srcCtx.drawImage(im, 0, 0);
      $('srcInfo').textContent = fileName + ': ' + im.naturalWidth + '×' + im.naturalHeight + ' px';
      $('name').value = srcName.slice(0, 40);
      guessGrid(); status(''); slice();
    };
    im.onerror = function () { status('Could not read that image.', true); };
    im.src = url;
  }
  // Sensible first guess: square frames equal to the sheet height for a single-row strip.
  function guessGrid() {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (w > h && w % h === 0) { $('fw').value = h; $('fh').value = h; $('cols').value = w / h; $('rows').value = 1; }
    else if (h > w && h % w === 0) { $('fw').value = w; $('fh').value = w; $('cols').value = 1; $('rows').value = h / w; }
  }

  function isEmpty(x, y, w, h) {
    var d = srcCtx.getImageData(x, y, w, h).data;
    for (var i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
    return true;
  }

  function slice() {
    frames = []; fi = 0;
    var ok = !!img;
    ['dlJson', 'dlZip', 'dlEach'].forEach(function (id) { $(id).disabled = true; });
    if (!ok) { drawSheet(); $('json').textContent = ''; return; }
    var W = img.naturalWidth, H = img.naturalHeight, m = int('margin', 0), sp = int('spacing', 0), fw, fh, cols, rows;
    if (by === 'size') {
      fw = int('fw', 1); fh = int('fh', 1);
      cols = Math.max(0, Math.floor((W - 2 * m + sp) / (fw + sp)));
      rows = Math.max(0, Math.floor((H - 2 * m + sp) / (fh + sp)));
    } else {
      cols = int('cols', 1); rows = int('rows', 1);
      fw = Math.floor((W - 2 * m - sp * (cols - 1)) / cols);
      fh = Math.floor((H - 2 * m - sp * (rows - 1)) / rows);
      if (fw < 1 || fh < 1) { cols = rows = 0; }
    }
    var skip = $('skipEmpty').checked, skipped = 0;
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var x = m + c * (fw + sp), y = m + r * (fh + sp);
      if (skip && isEmpty(x, y, fw, fh)) { skipped++; continue; }
      frames.push({ x: x, y: y, w: fw, h: fh, col: c, row: r });
    }
    $('gridInfo').textContent = cols && rows
      ? cols + ' × ' + rows + ' grid, frames ' + fw + '×' + fh + ' px, ' + frames.length + ' frame' + (frames.length === 1 ? '' : 's') +
        (skipped ? ' (' + skipped + ' empty skipped)' : '')
      : 'These settings do not fit a single frame on this sheet.';
    if (!frames.length && cols && rows) $('gridInfo').textContent += ' All frames are empty.';
    ['dlJson', 'dlZip', 'dlEach'].forEach(function (id) { $(id).disabled = !frames.length; });
    drawSheet(); sizeAnim(); $('json').textContent = JSON.stringify(buildJson(), null, 2);
  }

  function drawSheet() {
    var c = $('sheet'), g = c.getContext('2d');
    if (!img) { c.width = 10; c.height = 10; return; }
    var W = img.naturalWidth, H = img.naturalHeight;
    var z = Math.max(1, Math.min(8, Math.floor(900 / Math.max(W, 1)) || 1));
    c.width = W * z; c.height = H * z; c.style.width = (W * z) + 'px';
    g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, W * z, H * z);
    g.lineWidth = 1;
    frames.forEach(function (f, i) {
      g.strokeStyle = i === fi ? '#ffb547' : 'rgba(90,209,199,.85)';
      g.strokeRect(f.x * z + 0.5, f.y * z + 0.5, f.w * z - 1, f.h * z - 1);
    });
  }
  function sizeAnim() {
    var a = $('anim'), z = int('zoom', 1), f = frames[0];
    var w = f ? f.w : 32, h = f ? f.h : 32;
    a.width = w; a.height = h;
    a.style.width = (w * z) + 'px'; a.style.height = (h * z) + 'px';
    $('zoomVal').textContent = '×' + z;
    drawFrame();
  }
  function drawFrame() {
    var a = $('anim'), g = a.getContext('2d');
    g.clearRect(0, 0, a.width, a.height);
    var f = frames[fi];
    if (img && f) { g.imageSmoothingEnabled = false; g.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h); }
    $('frameNo').textContent = frames.length ? 'frame ' + (fi + 1) + ' / ' + frames.length : '';
  }
  function tick(t) {
    var fps = int('fps', 1);
    if (playingAnim && frames.length > 1 && t - lastT >= 1000 / fps) {
      lastT = t; fi = (fi + 1) % frames.length; drawFrame(); drawSheet();
    }
    requestAnimationFrame(tick);
  }

  function buildJson() {
    var fps = int('fps', 1), p = prefix(), pad = String(frames.length).length;
    return {
      meta: { app: 'Loopwork sprite sheet slicer', image: fileName, size: img ? { w: img.naturalWidth, h: img.naturalHeight } : null,
        margin: int('margin', 0), spacing: int('spacing', 0), fps: fps },
      frames: frames.map(function (f, i) {
        return { name: p + '_' + String(i).padStart(Math.max(2, pad), '0'), x: f.x, y: f.y, w: f.w, h: f.h, col: f.col, row: f.row, duration: Math.round(1000 / fps) };
      })
    };
  }
  function frameCanvas(f) {
    var c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
    c.getContext('2d').drawImage(srcCanvas, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    return c;
  }
  function framePngs() {
    var j = buildJson();
    return Promise.all(frames.map(function (f, i) {
      return Z.canvasToBytes(frameCanvas(f), 'image/png').then(function (b) { return { name: j.frames[i].name + '.png', data: b }; });
    }));
  }

  $('dlJson').addEventListener('click', function () {
    Z.downloadBlob(new Blob([JSON.stringify(buildJson(), null, 2)], { type: 'application/json' }), prefix() + '_frames.json');
    status('Saved ' + prefix() + '_frames.json');
  });
  $('dlZip').addEventListener('click', function () {
    framePngs().then(function (files) {
      files.push({ name: prefix() + '_frames.json', data: new TextEncoder().encode(JSON.stringify(buildJson(), null, 2)) });
      Z.downloadBlob(Z.makeZip(files), prefix() + '_frames.zip');
      status('Saved ZIP with ' + (files.length - 1) + ' PNG frames and the JSON.');
    }).catch(function (e) { status('Export failed: ' + e.message, true); });
  });
  $('dlEach').addEventListener('click', function () {
    framePngs().then(function (files) {
      var i = 0;
      (function next() {
        if (i >= files.length) { status('Saved ' + files.length + ' PNGs. If your browser asks to allow multiple downloads, say yes.'); return; }
        var f = files[i++]; Z.downloadBlob(new Blob([f.data], { type: 'image/png' }), f.name); setTimeout(next, 200);
      })();
    });
  });

  // ---- inputs ----
  var drop = $('drop');
  drop.addEventListener('click', function () { $('file').click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
  $('file').addEventListener('change', function () { loadFile(this.files[0]); this.value = ''; });
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-by]'), function (b) {
    b.addEventListener('click', function () {
      by = b.dataset.by;
      Array.prototype.forEach.call(document.querySelectorAll('[data-by]'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      $('bySize').hidden = by !== 'size'; $('byCount').hidden = by !== 'count';
      slice();
    });
  });
  ['fw', 'fh', 'cols', 'rows', 'margin', 'spacing', 'skipEmpty'].forEach(function (id) { $(id).addEventListener('input', slice); $(id).addEventListener('change', slice); });
  $('name').addEventListener('input', function () { if (img) $('json').textContent = JSON.stringify(buildJson(), null, 2); });
  $('fps').addEventListener('input', function () { $('fpsVal').textContent = this.value + ' fps'; if (img) $('json').textContent = JSON.stringify(buildJson(), null, 2); });
  $('zoom').addEventListener('input', sizeAnim);
  $('playPause').addEventListener('click', function () { playingAnim = !playingAnim; this.textContent = playingAnim ? 'Pause' : 'Play'; });

  slice(); requestAnimationFrame(tick);
  window.__sprites = { get frames() { return frames; }, buildJson: buildJson, loadFile: loadFile };
})();
