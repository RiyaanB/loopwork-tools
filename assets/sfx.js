/* Loopwork SFX synth (JS port of the Loopwork Dev Shop sfx_gen.py).
 * Seeded + deterministic. With default params (pitch 1, length 1, peak -1 dBFS,
 * noise 0) the output matches the Python reference for the original 7 types,
 * because the Python Mersenne Twister (random.Random(seed)) is reproduced here.
 * No dependencies. Exposes globalThis.LoopworkSFX. MIT, Loopwork Games. */
(function (root) {
  'use strict';
  var SR = 44100;

  // ---- MT19937 with CPython seeding (init_by_array on abs(seed) 32-bit words) ----
  function MT(seed) {
    this.mt = new Uint32Array(624);
    this.idx = 625;
    seed = Math.abs(Math.floor(Number(seed) || 0));
    var key = [];
    if (seed === 0) key.push(0);
    while (seed > 0) { key.push(seed % 4294967296); seed = Math.floor(seed / 4294967296); }
    this.initByArray(key);
  }
  MT.prototype.initGenrand = function (s) {
    var mt = this.mt;
    mt[0] = s >>> 0;
    for (var i = 1; i < 624; i++) {
      var p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, p) + i) >>> 0;
    }
    this.idx = 624;
  };
  MT.prototype.initByArray = function (key) {
    var mt = this.mt, i = 1, j = 0, k, p;
    this.initGenrand(19650218);
    for (k = Math.max(624, key.length); k; k--) {
      p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (((mt[i] ^ Math.imul(p, 1664525)) >>> 0) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (k = 623; k; k--) {
      p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (((mt[i] ^ Math.imul(p, 1566083941)) >>> 0) - i) >>> 0;
      i++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
    }
    mt[0] = 0x80000000;
  };
  MT.prototype.int32 = function () {
    var mt = this.mt, y, kk;
    if (this.idx >= 624) {
      for (kk = 0; kk < 624; kk++) {
        y = (mt[kk] & 0x80000000) | (mt[(kk + 1) % 624] & 0x7fffffff);
        mt[kk] = mt[(kk + 397) % 624] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
      }
      this.idx = 0;
    }
    y = mt[this.idx++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  };
  // Same as CPython random.random(): 53-bit float in [0,1)
  MT.prototype.random = function () {
    var a = this.int32() >>> 5, b = this.int32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  };

  // Small independent PRNG for the optional noise layer (keeps the main stream intact)
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // x*x is exactly what Python's (x)**2 gives (pow is exact for squares). Avoid the JS ** operator:
  // V8's optimizing compiler can round it differently from Math.pow, which broke bit-exactness in Chrome.
  function sq(x) { return x * x; }

  var TYPES = {
    coin:    { dur: 0.25, f0: 900,  label: 'Coin' },
    jump:    { dur: 0.3,  f0: 250,  label: 'Jump' },
    hit:     { dur: 0.2,  f0: 180,  label: 'Hit' },
    explode: { dur: 0.7,  f0: 70,   label: 'Explosion' },
    powerup: { dur: 0.5,  f0: 300,  label: 'Power-up' },
    click:   { dur: 0.06, f0: 1200, label: 'UI click' },
    whoosh:  { dur: 0.5,  f0: 200,  label: 'Whoosh' },
    laser:   { dur: 0.22, f0: 1400, label: 'Laser' },
    pickup:  { dur: 0.3,  f0: 700,  label: 'Pickup' },
    blip:    { dur: 0.08, f0: 600,  label: 'Blip' }
  };

  /**
   * synth(kind, seed, opts) -> Float64Array of samples in [-1,1] (pre-quantization)
   * opts: pitch (freq multiplier, default 1), length (duration multiplier, default 1),
   *       peakDb (normalize peak, default -1 dBFS => 0.89 like the Python ref),
   *       noise (0..1 white-noise blend, default 0)
   */
  function synth(kind, seed, opts) {
    opts = opts || {};
    var T = TYPES[kind];
    if (!T) throw new Error('unknown sfx type: ' + kind);
    var pitch = opts.pitch == null ? 1 : +opts.pitch;
    var lenMul = opts.length == null ? 1 : +opts.length;
    var noise = opts.noise == null ? 0 : Math.max(0, Math.min(1, +opts.noise));
    // The Python reference normalizes to a literal 0.89 and calls it -1 dBFS; keep that exact value at -1.
    var peak = (opts.peakDb == null || +opts.peakDb === -1) ? 0.89 : Math.pow(10, (+opts.peakDb) / 20);
    var r = new MT(seed);
    var nr = mulberry32((Number(seed) | 0) ^ 0x5bd1e995);
    var dur = T.dur * lenMul;
    var n = Math.max(1, Math.trunc(SR * dur));
    var out = new Float64Array(n);
    var tmp = new Float64Array(n);
    var ph = 0.0, lp = 0.0;
    var f0 = T.f0 * (0.9 + r.random() * 0.2) * pitch;
    var PI = Math.PI;
    for (var i = 0; i < n; i++) {
      var t = i / n, f, env, v;
      switch (kind) {
        case 'coin': f = f0 * (t < 0.35 ? 1 : 1.5); env = sq(1 - t); v = 0.5 * (Math.sin(ph) > 0 ? 1 : -1); break;
        case 'jump': f = f0 * (1 + 2 * t); env = (1 - t); v = Math.sin(ph); break;
        case 'hit': f = f0 * (1 - 0.7 * t); env = Math.pow(1 - t, 3); v = (r.random() * 2 - 1) * 0.6 + Math.sin(ph) * 0.4; break;
        case 'explode': f = f0; env = sq(1 - t); lp += 0.08 * ((r.random() * 2 - 1) - lp); v = lp * 3; break;
        case 'powerup': f = f0 * (1 + 3 * t); env = Math.min(1, t * 20) * (1 - t * 0.6); v = Math.sin(ph) + 0.3 * Math.sin(2 * ph); break;
        case 'click': f = f0 * (1 - t); env = Math.pow(1 - t, 4); v = Math.sin(ph); break;
        case 'whoosh': f = f0; env = sq(Math.sin(PI * t)); lp += (0.02 + 0.25 * t) * ((r.random() * 2 - 1) - lp); v = lp * 3; break;
        case 'laser': f = f0 * sq(1 - 0.8 * t); env = Math.min(1, t * 40) * (1 - t); v = 0.6 * (Math.sin(ph) > 0 ? 1 : -1) + 0.4 * Math.sin(ph); break;
        case 'pickup': f = f0 * (t < 0.3 ? 1 : t < 0.6 ? 1.26 : 1.5); env = Math.pow(1 - t, 1.5); v = 0.7 * Math.sin(ph) + 0.3 * (Math.sin(ph) > 0 ? 1 : -1); break;
        case 'blip': f = f0; env = t < 0.8 ? 1 : (1 - t) * 5; v = 0.5 * (Math.sin(ph) > 0 ? 1 : -1); break;
      }
      if (noise > 0) v = v * (1 - noise * 0.6) + (nr() * 2 - 1) * noise;
      ph += 2 * PI * f / SR;
      tmp[i] = Math.max(-1, Math.min(1, v * env * 0.8));
    }
    var pk = 0;
    for (i = 0; i < n; i++) { var a = Math.abs(tmp[i]); if (a > pk) pk = a; }
    var g = peak / (pk || 1);
    for (i = 0; i < n; i++) out[i] = tmp[i] * g;
    return out;
  }

  // Quantize like the Python reference: int(x*32767) (truncation toward zero)
  function toInt16(samples) {
    var q = new Int16Array(samples.length);
    for (var i = 0; i < samples.length; i++) q[i] = Math.trunc(Math.max(-1, Math.min(1, samples[i])) * 32767);
    return q;
  }

  // 16-bit PCM mono WAV (RIFF) as Uint8Array
  function encodeWav(samples, sampleRate) {
    sampleRate = sampleRate || SR;
    var pcm = samples instanceof Int16Array ? samples : toInt16(samples);
    var dataLen = pcm.length * 2;
    var buf = new ArrayBuffer(44 + dataLen);
    var dv = new DataView(buf);
    function str(o, s) { for (var k = 0; k < s.length; k++) dv.setUint8(o + k, s.charCodeAt(k)); }
    str(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, dataLen, true);
    for (var i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, pcm[i], true);
    return new Uint8Array(buf);
  }

  root.LoopworkSFX = { SR: SR, TYPES: TYPES, synth: synth, toInt16: toInt16, encodeWav: encodeWav, MT: MT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
