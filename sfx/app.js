/* Loopwork SFX generator UI. Depends on ../assets/sfx.js and ../assets/zip.js */
(function () {
  'use strict';
  var S = window.LoopworkSFX, Z = window.LoopworkZip;
  var $ = function (id) { return document.getElementById(id); };
  var DEFAULTS = { pitch: 1, length: 1, volume: -1, noise: 0 };
  var state = { type: 'coin', seed: 1, pitch: 1, length: 1, volume: -1, noise: 0 };
  var current = null, actx = null, playing = null;

  // --- type chips ---
  var typesEl = $('types');
  Object.keys(S.TYPES).forEach(function (k) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = S.TYPES[k].label; b.dataset.type = k;
    b.addEventListener('click', function () { state.type = k; update(true); });
    typesEl.appendChild(b);
  });

  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    if (h.has('type') && S.TYPES[h.get('type')]) state.type = h.get('type');
    ['seed', 'pitch', 'length', 'volume', 'noise'].forEach(function (k) {
      if (h.has(k) && isFinite(+h.get(k))) state[k] = +h.get(k);
    });
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function sanitize() {
    state.seed = clamp(Math.floor(state.seed) || 0, 0, 4294967295);
    state.pitch = clamp(state.pitch, 0.5, 2);
    state.length = clamp(state.length, 0.25, 3);
    state.volume = clamp(state.volume, -24, 0);
    state.noise = clamp(state.noise, 0, 1);
  }
  function syncInputs() {
    $('seed').value = state.seed;
    ['pitch', 'length', 'volume', 'noise'].forEach(function (k) { $(k).value = state[k]; });
    $('pitchVal').textContent = '×' + state.pitch.toFixed(2);
    $('lengthVal').textContent = '×' + state.length.toFixed(2);
    $('volumeVal').textContent = state.volume.toFixed(1) + ' dBFS';
    $('noiseVal').textContent = Math.round(state.noise * 100) + '%';
    Array.prototype.forEach.call(typesEl.children, function (b) {
      b.setAttribute('aria-pressed', b.dataset.type === state.type ? 'true' : 'false');
    });
  }
  function opts() { return { pitch: state.pitch, length: state.length, peakDb: state.volume, noise: state.noise }; }
  function fileName(seed) { return 'loopwork_' + state.type + '_' + String(seed).padStart(3, '0') + '.wav'; }
  function recipe() {
    return 'type=' + state.type + '&seed=' + state.seed + '&pitch=' + state.pitch + '&length=' + state.length +
      '&volume=' + state.volume + '&noise=' + state.noise;
  }

  function render() {
    var samples = S.synth(state.type, state.seed, opts());
    var pcm = S.toInt16(samples);
    current = { pcm: pcm, wav: S.encodeWav(pcm, S.SR) };
    drawWave(pcm);
    $('info').textContent = S.TYPES[state.type].label + ', seed ' + state.seed + ': ' +
      (pcm.length / S.SR * 1000).toFixed(0) + ' ms, ' + pcm.length + ' samples, ' +
      (current.wav.length / 1024).toFixed(1) + ' KB WAV';
    var link = location.pathname + '#' + recipe();
    $('permalink').href = '#' + recipe();
    try { history.replaceState(null, '', link); } catch (e) { /* file:// in some browsers */ }
  }

  function drawWave(pcm) {
    var c = $('wave'), g = c.getContext('2d');
    var w = c.width, h = c.height, mid = h / 2;
    g.fillStyle = '#0b0d11'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2a2f3a'; g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
    g.fillStyle = '#ffb547';
    var per = pcm.length / w;
    for (var x = 0; x < w; x++) {
      var a = Math.floor(x * per), b = Math.max(a + 1, Math.floor((x + 1) * per)), mn = 0, mx = 0;
      for (var i = a; i < b && i < pcm.length; i++) { var v = pcm[i] / 32768; if (v < mn) mn = v; if (v > mx) mx = v; }
      g.fillRect(x, mid - mx * mid * 0.95, 1, Math.max(1, (mx - mn) * mid * 0.95));
    }
  }

  function play() {
    if (!current) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { status('Web Audio is not available in this browser. You can still download the WAV.', true); return; }
      if (!actx) actx = new AC();
      if (actx.state === 'suspended') actx.resume();
      if (playing) { try { playing.stop(); } catch (e) {} }
      var buf = actx.createBuffer(1, current.pcm.length, S.SR), ch = buf.getChannelData(0);
      for (var i = 0; i < current.pcm.length; i++) ch[i] = current.pcm[i] / 32768;
      var src = actx.createBufferSource(); src.buffer = buf; src.connect(actx.destination); src.start();
      playing = src;
    } catch (e) { status('Could not play audio: ' + e.message, true); }
  }

  function status(msg, err) { var s = $('status'); s.textContent = msg || ''; s.className = 'status' + (err ? ' err' : ''); }

  var userTouched = false;
  function update(sound) {
    sanitize(); syncInputs(); render();
    if (sound && userTouched && $('autoplay').checked) play();
  }

  // --- events ---
  document.addEventListener('pointerdown', function () { userTouched = true; }, { once: true });
  document.addEventListener('keydown', function () { userTouched = true; }, { once: true });
  $('seed').addEventListener('change', function () { state.seed = +this.value; update(true); });
  $('seedUp').addEventListener('click', function () { state.seed++; update(true); });
  $('seedDown').addEventListener('click', function () { state.seed = Math.max(0, state.seed - 1); update(true); });
  ['pitch', 'length', 'volume', 'noise'].forEach(function (k) {
    $(k).addEventListener('input', function () { state[k] = +this.value; update(false); });
    $(k).addEventListener('change', function () { update(true); });
  });
  $('reset').addEventListener('click', function () { Object.assign(state, DEFAULTS); update(true); });
  $('randomize').addEventListener('click', function () {
    var keys = Object.keys(S.TYPES);
    state.type = keys[Math.floor(Math.random() * keys.length)];
    state.seed = Math.floor(Math.random() * 10000);
    state.pitch = +(0.7 + Math.random() * 0.8).toFixed(2);
    state.length = +(0.6 + Math.random() * 1.0).toFixed(2);
    state.noise = Math.random() < 0.6 ? 0 : +(Math.random() * 0.4).toFixed(2);
    update(true);
  });
  $('play').addEventListener('click', play);
  $('download').addEventListener('click', function () {
    if (!current) return;
    Z.downloadBlob(new Blob([current.wav], { type: 'audio/wav' }), fileName(state.seed));
    status('Saved ' + fileName(state.seed));
  });
  $('batch').addEventListener('click', function () {
    var n = clamp(Math.floor(+$('batchN').value) || 10, 2, 50), files = [];
    for (var i = 0; i < n; i++) {
      var seed = state.seed + i;
      files.push({ name: fileName(seed), data: S.encodeWav(S.toInt16(S.synth(state.type, seed, opts())), S.SR) });
    }
    files.push({ name: 'RECIPE.txt', data: new TextEncoder().encode(
      'Made with Loopwork SFX generator (procedurally synthesized).\n' +
      'https://riyaanb.github.io/loopwork-tools/sfx/#' + recipe() + '\nSeeds ' + state.seed + '..' + (state.seed + n - 1) + '\n') });
    Z.downloadBlob(Z.makeZip(files), 'loopwork_' + state.type + '_seeds_' + state.seed + '-' + (state.seed + n - 1) + '.zip');
    status('Saved ZIP with ' + n + ' WAV files');
  });
  window.addEventListener('hashchange', function () { readHash(); update(false); });

  readHash(); update(false);
  window.__sfx = { state: state, get current() { return current; } }; // handy for tests / console
})();
