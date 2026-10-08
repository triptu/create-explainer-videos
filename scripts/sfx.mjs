// Sound-effects library: soft, warm motion-graphics sounds synthesized in pure Node (no samples, no deps).
// Deterministic: each sound has its own seeded PRNG, so every run writes identical files.
//   npm run sfx <outDir> [names...]        → <outDir>/<name>.wav (44.1 kHz, 16-bit stereo)
//   import { SFX, writeSfx } from "./sfx.mjs"   SFX = { name: { dur, desc } }, writeSfx(outDir, names?)
// Levels: peaks ≤ -3 dBFS; one-shots normalized by max momentary loudness (K-weighted, 400 ms), ambiences
// by integrated loudness (~-30 LUFS). Ambiences loop seamlessly (the loop point is crossfaded).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100, TAU = 2 * Math.PI;
const { sin, cos, exp, PI, min, max, abs, floor, round } = Math;
const N = (s) => round(s * SR);

// ── basics ──────────────────────────────────────────────────────────────────────────────────────
const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const mulberry = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const between = (r, a, b) => a + (b - a) * r();
const xr = (a, b, u) => a * Math.pow(b / a, u); // exponential ramp a→b
const ss = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const rc = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 0.5 - 0.5 * cos(PI * u)); // raised-cosine 0→1
/** attack (raised cosine, a s) then exponential decay (time constant tau s). */
const ad = (t, a, tau) => (t < 0 ? 0 : t < a ? rc(t / a) : exp(-(t - a) / tau));
/** gate: raised-cosine in over a, hold, raised-cosine out over r, total length d. */
const gate = (t, d, a, r) => (t < 0 || t > d ? 0 : min(rc(t / a), rc((d - t) / r)));

const white = (r, n) => Float32Array.from({ length: n }, () => r() * 2 - 1);
const pink = (r, n) => { // Paul Kellet's filter
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; const o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    o[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return o;
};
/** smooth random LFO in [0,1]: random points `rate` per second, cosine-interpolated. */
const lfo = (r, n, rate) => {
  const pts = Array.from({ length: Math.ceil((n / SR) * rate) + 2 }, r), o = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = (i / SR) * rate, k = floor(p); o[i] = pts[k] + (pts[k + 1] - pts[k]) * rc(p - k); }
  return o;
};

// ── filters ─────────────────────────────────────────────────────────────────────────────────────
/** RBJ biquad (TDF-II). type: lp hp bp peak hs. */
const biquad = () => {
  let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
  return {
    set(type, f, q = 0.707, db = 0) {
      const w = (TAU * min(max(f, 10), SR * 0.45)) / SR, c = cos(w), al = sin(w) / (2 * q), A = Math.pow(10, db / 40);
      let B0, B1, B2, A0, A1, A2;
      if (type === "lp") [B0, B1, B2, A0, A1, A2] = [(1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al];
      else if (type === "hp") [B0, B1, B2, A0, A1, A2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al];
      else if (type === "bp") [B0, B1, B2, A0, A1, A2] = [al, 0, -al, 1 + al, -2 * c, 1 - al];
      else if (type === "peak") [B0, B1, B2, A0, A1, A2] = [1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A];
      else { const s = 2 * Math.sqrt(A) * al; // high shelf
        [B0, B1, B2, A0, A1, A2] = [A * (A + 1 + (A - 1) * c + s), -2 * A * (A - 1 + (A + 1) * c), A * (A + 1 + (A - 1) * c - s), A + 1 - (A - 1) * c + s, 2 * (A - 1 - (A + 1) * c), A + 1 - (A - 1) * c - s]; }
      b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = A1 / A0; a2 = A2 / A0;
      return this;
    },
    run(x) { const y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; return y; },
  };
};
/** filter a buffer; f and q may be functions of time (s), updated every 32 samples. */
const filt = (x, type, f, q = 0.707, db = 0) => {
  const bq = biquad(), o = new Float32Array(x.length), fv = typeof f === "function", qv = typeof q === "function";
  if (!fv && !qv) bq.set(type, f, q, db);
  for (let i = 0; i < x.length; i++) {
    if ((fv || qv) && i % 32 === 0) bq.set(type, fv ? f(i / SR) : f, qv ? q(i / SR) : q, db);
    o[i] = bq.run(x[i]);
  }
  return o;
};

/** 8-line feedback-delay-network reverb with input diffusion and damping. Returns stereo [L, R]. */
const reverb = (inp, { rt = 1.2, size = 1, damp = 5000, wet = 0.25, pre = 0.012 } = {}) => {
  const [L, R] = st(inp), n = L.length, oL = new Float32Array(n), oR = new Float32Array(n);
  const lens = [1031, 1327, 1523, 1801, 2063, 2357, 2621, 2903].map((d) => round(d * size));
  const lines = lens.map((l) => new Float32Array(l)), idx = new Array(8).fill(0), lp = new Array(8).fill(0);
  const g = lens.map((l) => Math.pow(10, (-3 * l) / (rt * SR))), dc = exp((-TAU * damp) / SR);
  const ap = [142, 107, 379, 277].map((l) => ({ b: new Float32Array(round(l * size)), i: 0 }));
  const pd = new Float32Array(max(1, N(pre))); let pi = 0;
  const o = new Array(8);
  for (let i = 0; i < n; i++) {
    let x = pd[pi]; pd[pi] = (L[i] + R[i]) * 0.5; pi = (pi + 1) % pd.length;
    for (const a of ap) { const d = a.b[a.i], y = d - 0.6 * x; a.b[a.i] = x + 0.6 * y; a.i = (a.i + 1) % a.b.length; x = y; }
    let s = 0;
    for (let k = 0; k < 8; k++) { o[k] = lines[k][idx[k]]; lp[k] = o[k] * (1 - dc) + lp[k] * dc; s += lp[k]; }
    s *= 0.25;
    for (let k = 0; k < 8; k++) { lines[k][idx[k]] = (lp[k] - s) * g[k] + x * (k & 1 ? 0.5 : -0.5); idx[k] = (idx[k] + 1) % lens[k]; }
    const yl = o[0] - o[2] + o[4] - o[6], yr = o[1] - o[3] + o[5] - o[7];
    oL[i] = L[i] * (1 - wet * 0.5) + yl * wet * 0.5; oR[i] = R[i] * (1 - wet * 0.5) + yr * wet * 0.5;
  }
  return [oL, oR];
};

// ── building blocks ─────────────────────────────────────────────────────────────────────────────
const st = (x) => (Array.isArray(x) ? x : [x, Float32Array.from(x)]);
const pan = (x, p) => [x.map((v) => v * cos(((p + 1) * PI) / 4) * Math.SQRT2), x.map((v) => v * sin(((p + 1) * PI) / 4) * Math.SQRT2)];
/** add src (mono or stereo) into dst (stereo) at time t0, scaled. */
const add = (dst, src, t0 = 0, gain = 1) => {
  const [a, b] = st(src), i0 = N(t0);
  for (let i = 0; i < a.length && i0 + i < dst[0].length; i++) { dst[0][i0 + i] += a[i] * gain; dst[1][i0 + i] += b[i] * gain; }
  return dst;
};
const stereo = (s) => [new Float32Array(N(s)), new Float32Array(N(s))];
/** additive oscillator: f(t) Hz, amp(t), partials [[ratio, amp, decayTau?]]. */
const tone = (dur, f, amp, partials = [[1, 1]]) => {
  const o = new Float32Array(N(dur)); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, fr = f(t); ph += fr / SR; ph -= floor(ph);
    let s = 0;
    for (const [r, a, tau] of partials) if (fr * r < 16000) s += a * (tau ? exp(-t / tau) : 1) * sin(TAU * ((ph * r) % 1));
    o[i] = s * amp(t) * rc((o.length - i) / 220); // 5 ms end fade: never truncate a waveform
  }
  return o;
};
/** shaped noise burst: noise type → filter → envelope */
const burst = (r, dur, env, type, f, q = 0.707, kind = white) => filt(kind(r, N(dur)), type, f, q).map((v, i) => v * env(i / SR));

/** mallet/bell note: partials with own decays, tiny pitch dip on attack. */
const mallet = (f0, dur, partials, { a = 0.002, bend = 0 } = {}) =>
  tone(dur, (t) => f0 * (1 + bend * exp(-t / 0.015)), (t) => ad(t, a, 1e9) * gate(t, dur, 1e-4, 0.02), partials);

/** pitched blip that glides from f0 toward f1 (exponential approach). */
const blip = (f0, f1, glide, a, tau, partials = [[1, 1], [2, 0.12, 0.02]]) =>
  tone(a + tau * 7, (t) => f1 + (f0 - f1) * exp(-t / glide), (t) => ad(t, a, tau), partials);

/** robot voice: syllables with pitch keyframes [[u, Hz]], glides and vibrato. Each syllable is a soft FM tone whose
 *  brightness opens on the attack (a "b"/"d"-like consonant), with a moving vowel formant v: [fromHz, toHz] ("oo"→"ee"),
 *  a fast 27 Hz pitch flutter for an electronic burble, and a quiet sub-octave for roundness. */
const robot = (r, dur, syls, { vib = 25, rate = 6, bright = 2400, fm = 0.7, wet = 0.3, flut = 30 } = {}) => {
  const out = new Float32Array(N(dur)), jit = lfo(r, out.length, 14);
  for (const s of syls) {
    const keys = s.p, d = s.d, a = s.a ?? 0.015, rel = s.r ?? 0.1, vd = s.vib ?? vib, vr = s.rate ?? rate, idx = s.fm ?? fm, [v0, v1] = s.v ?? [650, 1500];
    const pitch = (u) => { let k = 0; while (k < keys.length - 2 && u > keys[k + 1][0]) k++;
      const [u0, f0] = keys[k], [u1, f1] = keys[k + 1]; return xr(f0, f1, ss((u - u0) / (u1 - u0 || 1))); };
    const i0 = N(s.t), syl = new Float32Array(N(d)); let ph = 0, sub = 0;
    for (let i = 0; i < syl.length; i++) {
      const t = i / SR, u = t / d, cents = vd * ss(t / 0.12) * sin(TAU * vr * t) + 15 * (jit[min(i0 + i, jit.length - 1)] - 0.5) + flut * sin(TAU * 27 * t);
      const f = pitch(u) * Math.pow(2, cents / 1200);
      ph = (ph + f / SR) % 1; sub = (sub + f / 2 / SR) % 1;
      const env = Math.pow(gate(t, d, a, rel), 1.5) * (s.amp ?? 1) * (1 - 0.2 * u) * (s.trem ? 1 - s.trem * (0.5 + 0.5 * sin(TAU * 10 * t)) : 1);
      const k = idx * (0.7 + 0.3 * u) + 1.1 * exp(-t / 0.025);
      syl[i] = env * (sin(TAU * ph + k * sin(TAU * ph)) + 0.1 * sin(TAU * sub));
    }
    const y = filt(syl, "peak", (t) => xr(v0, v1, ss(t / d)), 2.5, 7);
    for (let i = 0; i < y.length && i0 + i < out.length; i++) out[i0 + i] += y[i];
  }
  return reverb(filt(out, "lp", bright, 0.6), { rt: 0.9, size: 0.6, wet });
};

/** a cloud of tiny high pings (pentatonic), for sparkle/shimmer. */
const PENTA = [0, 2, 4, 7, 9];
const pings = (r, dur, count, { from = 0, span = 0.6, lo = 24, hi = 40, shape = 1.3, level = 1 } = {}) => {
  const out = stereo(dur);
  for (let k = 0; k < count; k++) {
    const u = k / count, t = from + span * Math.pow(u, shape) + between(r, 0, 0.03);
    const step = floor(lo + (hi - lo) * (0.3 * u + 0.7 * r())), semi = floor(step / 5) * 12 + PENTA[step % 5];
    const f = 261.63 * Math.pow(2, (semi - 12) / 12), tau = between(r, 0.06, 0.2);
    const env = (1 - 0.7 * u) * between(r, 0.5, 1) * level;
    add(out, pan(mallet(f, tau * 6, [[1, 1, tau], [2.76, 0.12, tau / 4]], { a: 0.0015 }), between(r, -0.7, 0.7)), t, env);
  }
  return out;
};

// ── the library ─────────────────────────────────────────────────────────────────────────────────
/** dur s, desc, generator (rng, samples) → mono or [L, R], loudness target (LUFS), peak ceiling (dBFS). */
const S = (dur, desc, gen, lufs = -16, peak = -3) => ({ dur, desc, lufs, peak, gen });
export const SFX = {
  pop: S(0.25, "soft bubbly pop for an element appearing", (r) => {
    const o = add(stereo(0.25), blip(540, 300, 0.012, 0.0025, 0.03, [[1, 1], [2, 0.08, 0.01]]));
    add(o, burst(r, 0.04, (t) => ad(t, 0.001, 0.006), "lp", 900, 0.8, pink), 0, 0.2);
    return reverb(o, { rt: 0.35, size: 0.4, wet: 0.12 });
  }),
  "pop-small": S(0.2, "subtler, higher pop for small items / list items", () =>
    reverb(blip(900, 560, 0.008, 0.0015, 0.018, [[1, 1]]), { rt: 0.3, size: 0.35, wet: 0.1 }), -19),
  tick: S(0.08, "tiny soft click for counters / small state changes", (r) => {
    const o = add(stereo(0.08), tone(0.08, () => 1400, (t) => ad(t, 0.0008, 0.004)), 0, 0.5);
    add(o, burst(r, 0.03, (t) => ad(t, 0.0005, 0.003), "bp", 2600, 2), 0, 1);
    return [filt(o[0], "lp", 6000), filt(o[1], "lp", 6000)];
  }, -22, -7),
  whoosh: S(0.7, "airy whoosh for camera moves or things flying", (r) => {
    const env = (t) => Math.pow(rc(t / 0.36), 1.6) * (t < 0.36 ? 1 : exp(-(t - 0.36) / 0.09));
    const sweep = (t) => (t < 0.36 ? xr(350, 1900, ss(t / 0.36)) : xr(1900, 700, min(1, (t - 0.36) / 0.3)));
    const L = burst(r, 0.7, env, "bp", sweep, 1.1, pink), R = burst(r, 0.7, env, "bp", (t) => sweep(t) * 1.06, 1.1, pink);
    const p = (i) => (i / L.length) * 1.4 - 0.7; // pans left → right
    return reverb([L.map((v, i) => v * cos(((p(i) + 1) * PI) / 4) * 1.4), R.map((v, i) => v * sin(((p(i) + 1) * PI) / 4) * 1.4)], { rt: 0.6, wet: 0.15 });
  }, -18),
  "whoosh-soft": S(1.1, "gentler, lower, longer whoosh for slow camera pans", (r) => {
    const env = (t) => rc(t / 0.55) * (t < 0.55 ? 1 : exp(-(t - 0.55) / 0.16));
    const sweep = (t) => (t < 0.55 ? xr(180, 700, ss(t / 0.55)) : xr(700, 300, min(1, (t - 0.55) / 0.5)));
    const ch = (m) => { // low body + a quieter airy layer an octave and a half above
      const body = burst(r, 1.1, env, "bp", (t) => sweep(t) * m, 0.8, pink), air = burst(r, 1.1, env, "bp", (t) => sweep(t) * 3.5 * m, 1, pink);
      return body.map((v, i) => v + air[i] * 0.3);
    };
    return reverb([ch(1), ch(1.08)], { rt: 0.8, wet: 0.18 });
  }, -20),
  swipe: S(0.3, "quick short swish for slide-ins", (r) => {
    const env = (t) => Math.pow(rc(t / 0.12), 1.2) * (t < 0.12 ? 1 : exp(-(t - 0.12) / 0.06));
    const sweep = (t) => xr(700, 2600, min(1, t / 0.18));
    return reverb([burst(r, 0.3, env, "bp", sweep, 0.9, pink), burst(r, 0.3, env, "bp", (t) => sweep(t) * 1.07, 0.9, pink)], { rt: 0.4, size: 0.5, wet: 0.12 });
  }, -19),
  ding: S(2.0, "clean bell for a correct / positive moment", () => {
    const f = 1318.5, p = [[1, 1, 0.42], [2, 0.18, 0.22], [2.76, 0.16, 0.12], [5.4, 0.04, 0.04], [0.5, 0.06, 0.35]];
    const o = add(stereo(2), mallet(f, 2, p, { a: 0.0015, bend: 0.004 }));
    add(o, mallet(f + 1.3, 2, [[1, 0.35, 0.5]], { a: 0.002 }));
    return reverb(o, { rt: 1.3, wet: 0.25 });
  }),
  success: S(1.8, "short three-note rising major arpeggio chime, warm", () => {
    const o = stereo(1.8), notes = [523.25, 659.25, 783.99];
    notes.forEach((f, k) => add(o, pan(mallet(f, 1.2, [[1, 1, k === 2 ? 0.38 : 0.22], [2, 0.3, 0.18], [3, 0.08, 0.08], [4, 0.05, 0.05]], { a: 0.003 }), (k - 1) * 0.3), k * 0.085, 0.9));
    add(o, mallet(1567.98, 1.1, [[1, 0.18, 0.4]], { a: 0.004 }), 0.17);
    return reverb(o, { rt: 1.1, wet: 0.25 });
  }),
  fail: S(0.9, "soft gentle 'nope': low two-note falling tone", () => {
    // two soft, slightly chorused tones that sag in pitch and fade like a sigh ("nuh-uh")
    const note = (f, d, bend) => tone(d + 0.45, (t) => f * Math.pow(2, (-bend * ss(t / (d + 0.15))) / 12),
      (t) => rc(t / 0.018) * exp(-t / 0.35) * (t < d ? 1 : exp(-(t - d) / 0.08)), [[1, 1], [1.004, 0.6], [2, 0.18], [3, 0.05]]);
    const o = add(add(stereo(0.9), pan(note(311.13, 0.12, 0.15), -0.15)), pan(note(233.08, 0.2, 0.6), 0.15), 0.18);
    return reverb([filt(o[0], "lp", 1200), filt(o[1], "lp", 1200)], { rt: 0.6, wet: 0.2 });
  }, -18),
  thud: S(0.6, "soft low impact for something landing", (r) => {
    const o = add(stereo(0.6), tone(0.6, (t) => 48 + 70 * exp(-t / 0.03), (t) => ad(t, 0.003, 0.13)));
    add(o, tone(0.3, (t) => 170 + 40 * exp(-t / 0.02), (t) => ad(t, 0.002, 0.04)), 0, 0.35);
    add(o, burst(r, 0.2, (t) => ad(t, 0.002, 0.03), "lp", 500, 0.7, pink), 0, 0.9);
    return reverb(o, { rt: 0.4, size: 0.5, wet: 0.08 });
  }, -17),
  sparkle: S(1.3, "delicate high glittery shimmer for magic / insight moments", (r) => {
    const o = pings(r, 1.3, 22, { span: 0.65, lo: 20, hi: 30 });
    add(o, [burst(r, 1.3, (t) => rc(t / 0.15) * exp(-t / 0.3), "hp", 7000, 0.7), burst(r, 1.3, (t) => rc(t / 0.15) * exp(-t / 0.3), "hp", 7000, 0.7)], 0, 0.08);
    return reverb(o, { rt: 1.6, wet: 0.35, damp: 9000 });
  }, -20),
  riser: S(2.5, "tension riser (filtered noise + rising tone) leading into a reveal", (r) => {
    const d = 2.45, env = (t) => Math.pow(min(t / d, 1), 2.2) * gate(t, d, 0.05, 0.03);
    const o = stereo(2.5), nz = (k) => burst(r, 2.5, env, "bp", (t) => xr(250, 6500, Math.pow(min(t / d, 1), 1.5)), (t) => 0.8 + 1.5 * (t / d), pink);
    add(o, [nz(), nz()], 0, 1.2);
    for (const det of [-8, 0, 8]) {
      const v = tone(2.5, (t) => xr(110, 440, Math.pow(min(t / d, 1), 1.4)) * Math.pow(2, det / 1200), (t) => env(t) * (1 + 0.08 * sin(TAU * xr(3, 10, t / d) * t)), [[1, 1], [2, 0.3], [3, 0.1]]);
      add(o, pan(filt(v, "lp", (t) => xr(400, 3000, min(t / d, 1))), det / 12), 0, 0.1);
    }
    return reverb(o, { rt: 1.2, wet: 0.2 });
  }),
  reveal: S(3.5, "soft impact + shimmer tail, the payoff after a riser", (r) => {
    const o = add(stereo(3.5), tone(1.5, (t) => 55 + 60 * exp(-t / 0.04), (t) => ad(t, 0.004, 0.3)), 0, 0.8);
    add(o, tone(0.6, (t) => 150 + 80 * exp(-t / 0.02), (t) => ad(t, 0.003, 0.1)), 0, 0.6);
    add(o, burst(r, 1.2, (t) => ad(t, 0.004, 0.25), "lp", (t) => 300 + 2500 * exp(-t / 0.08), 0.7, pink), 0, 1.2); // air burst
    for (const [k, f] of [261.63, 392, 523.25, 659.25, 783.99].entries())
      add(o, pan(tone(3.5, (t) => f * (1 + 0.0015 * sin(TAU * 0.7 * t + k)), (t) => ad(t, 0.04, 0.6), [[1, 1], [2, 0.15]]), (k - 2) * 0.3), 0, 0.12);
    add(o, pings(r, 3.5, 22, { from: 0.08, span: 1.5, lo: 19, hi: 28, shape: 1.6, level: 0.3 }));
    return reverb(o, { rt: 2.2, wet: 0.35, damp: 7000 });
  }),
  type: S(0.65, "short burst of soft keyboard ticks", (r) => {
    const o = stereo(0.65), key = (fc, lvl) => {
      const click = burst(r, 0.03, (x) => ad(x, 0.0005, 0.003), "bp", fc, 0.9), thock = filt(burst(r, 0.05, (x) => ad(x, 0.001, 0.01), "lp", 1200, 0.7, pink), "hp", 200);
      return thock.map((v, i) => (v + 0.5 * (click[i] ?? 0)) * lvl);
    };
    for (let t = 0.01; t < 0.5; t += r() < 0.25 ? between(r, 0.15, 0.22) : between(r, 0.08, 0.14)) {
      const lvl = between(r, 0.6, 1), p = between(r, -0.35, 0.35), fc = between(r, 2500, 4000);
      add(o, pan(key(fc, lvl), p), t); // press (bottom-out)
      add(o, pan(burst(r, 0.02, (x) => ad(x, 0.0005, 0.003), "bp", fc * 0.8, 0.9), p), t + between(r, 0.035, 0.06), lvl * 0.25); // release
    }
    return reverb(o, { rt: 0.3, size: 0.4, wet: 0.12 });
  }, -20, -6),
  scribble: S(0.85, "pen / marker drawing on paper", (r) => {
    const o = new Float32Array(N(0.85)), am = lfo(r, o.length, 35), fm = lfo(r, o.length, 9);
    for (let t = 0.02; t < 0.72;) {
      const d = between(r, 0.09, 0.2), lvl = between(r, 0.6, 1), x = white(r, N(d));
      const y = filt(filt(x, "bp", (s) => 1400 + 1600 * fm[min(N(t + s), o.length - 1)], 1.3), "hp", 700);
      const i0 = N(t); for (let i = 0; i < y.length && i0 + i < o.length; i++) o[i0 + i] += y[i] * lvl * gate(i / SR, d, 0.02, 0.025) * (0.35 + 0.65 * am[i0 + i]);
      t += d + between(r, 0.015, 0.05);
    }
    return reverb(filt(o, "lp", 4500), { rt: 0.3, size: 0.4, wet: 0.08 });
  }, -22),
  step: S(0.4, "one soft footstep on dirt / grass", (r) => {
    // heel then toe roll: muffled low-mid body + crackly dirt grains (sparse impulses, low-passed, soft-clipped)
    const o = stereo(0.4), grains = (d, tau) => filt(white(r, N(d)).map((v) => (r() < 0.03 ? v * 2.5 : v * 0.3)), "lp", 2200, 0.6).map((v, i) => Math.tanh(2 * v) * ad(i / SR, 0.02, tau));
    for (const [t, l] of [[0.005, 1], [0.035, 0.5]]) {
      add(o, burst(r, 0.2, (x) => ad(x, 0.012, 0.045), "bp", 180, 0.7, pink), t, l);
      add(o, filt(grains(0.25, 0.045), "hp", 250), t, l * 0.6);
    }
    return o;
  }, -23, -6),
  count: S(0.35, "single soft musical mallet blip for number counters", (r) => {
    const o = add(stereo(0.35), mallet(784, 0.35, [[1, 1, 0.1], [4, 0.08, 0.015], [2, 0.05, 0.03]], { a: 0.0015 }));
    add(o, burst(r, 0.02, (t) => ad(t, 0.0005, 0.002), "bp", 2500, 1), 0, 0.06);
    return reverb(o, { rt: 0.35, size: 0.4, wet: 0.1 });
  }, -19),

  // robot mascot
  "chirp-happy": S(0.85, "robot: bright upward 'boo-dee!'", (r) => robot(r, 0.85, [
    { t: 0, d: 0.11, p: [[0, 520], [1, 550]], vib: 0, v: [500, 700] },
    { t: 0.14, d: 0.2, p: [[0, 700], [0.6, 740], [1, 900]], vib: 0 },
    { t: 0.36, d: 0.2, p: [[0, 1040], [1, 1170]], r: 0.1 },
  ]), -17),
  "chirp-curious": S(0.9, "robot: rising questioning 'hmm?'", (r) => robot(r, 0.9, [
    { t: 0, d: 0.15, p: [[0, 430], [1, 410]], vib: 0, v: [500, 500] },
    { t: 0.19, d: 0.4, p: [[0, 400], [0.4, 450], [1, 820]], r: 0.12 },
  ], { vib: 18 }), -17),
  "chirp-sad": S(1.25, "robot: falling, droopy 'awww'", (r) => robot(r, 1.25, [
    { t: 0, d: 0.18, p: [[0, 620], [1, 600]], vib: 0 },
    { t: 0.24, d: 0.66, p: [[0, 600], [0.25, 560], [1, 320]], vib: 40, rate: 5, r: 0.2, v: [1400, 500] },
  ], { bright: 1700 }), -18),
  "chirp-surprised": S(0.6, "robot: quick upward jump '!'", (r) => robot(r, 0.6, [
    { t: 0, d: 0.06, p: [[0, 380], [1, 400]], vib: 0, r: 0.02 },
    { t: 0.07, d: 0.2, p: [[0, 760], [0.15, 1150], [1, 1220]], a: 0.006, vib: 20, rate: 9 },
  ]), -17),
  "chirp-excited": S(0.95, "robot: rapid happy trill", (r) => {
    const syls = [];
    for (let k = 0; k < 10; k++) { const b = xr(600, 860, k / 9), last = k === 9;
      syls.push({ t: k * 0.055, d: last ? 0.12 : 0.045, p: last ? [[0, b], [1, b * 1.5]] : [[0, b * (k % 2 ? 1.26 : 1)], [1, b * (k % 2 ? 1.3 : 1.03)]], a: 0.005, r: last ? 0.04 : 0.012, vib: 0 }); }
    return robot(r, 0.95, syls);
  }, -17),
  "chirp-thinking": S(1.35, "robot: low wobbly 'hmmmm' hum", (r) => robot(r, 1.35, [
    { t: 0, d: 1.0, p: [[0, 230], [0.3, 265], [0.65, 225], [1, 250]], a: 0.06, r: 0.2, vib: 55, rate: 3.5, v: [450, 750] },
  ], { bright: 1500, fm: 0.5 }), -19),
  "chirp-hello": S(0.8, "robot: friendly greeting beep-boop", (r) => robot(r, 0.8, [
    { t: 0, d: 0.12, p: [[0, 620], [1, 660]], vib: 0, v: [1500, 1200] },
    { t: 0.16, d: 0.3, p: [[0, 820], [0.3, 940], [1, 880]], r: 0.1, v: [600, 1300] },
  ]), -17),
  "chirp-worried": S(1.15, "robot: nervous wavering little warble", (r) => robot(r, 1.15, [
    { t: 0, d: 0.18, p: [[0, 650], [1, 610]], trem: 0.3 },
    { t: 0.22, d: 0.18, p: [[0, 630], [1, 570]], trem: 0.3 },
    { t: 0.44, d: 0.4, p: [[0, 600], [0.5, 545], [1, 490]], trem: 0.35, r: 0.12 },
  ], { vib: 45, rate: 9, bright: 1800 }), -18),

  // ambience beds (20 s, loopable)
  "amb-wind": S(20, "mountain wind / fog atmosphere with soft gusts", (r, n) => {
    const slow = lfo(r, n, 0.05), gust = lfo(r, n, 0.13), g = slow.map((v, i) => ss((0.6 * v + 0.4 * gust[i] - 0.2) / 0.6));
    const ch = (sh) => { // soft air body + resonant howls whose pitch rises with each gust (the cue that says "wind", not surf)
      const body = filt(filt(pink(r, n), "bp", (t) => 400 + 600 * g[N(t)], 0.9), "hp", 220);
      const howl = [[1, 1], [1.47, 0.6], [2.13, 0.3]].map(([m, a]) => filt(white(r, n), "bp", (t) => (320 + 700 * g[N(t)]) * m * sh, 30).map((v) => v * a));
      return body.map((v, i) => v * (0.12 + 0.6 * g[i]) + (howl[0][i] + howl[1][i] + howl[2][i]) * 4 * Math.pow(g[i], 1.5));
    };
    return reverb([ch(1), ch(1.025)], { rt: 1.8, wet: 0.3 });
  }, -30),
  "amb-lab": S(20, "gentle server-room / lab hum with faint electronic detail", (r, n) => {
    const dur = n / SR, hum = tone(dur, () => 60, (t) => 0.9 + 0.1 * sin(TAU * 0.13 * t), [[1, 0.3], [2, 0.4], [3, 0.2], [5, 0.06]]);
    const fan = () => filt(filt(pink(r, n), "lp", 2200, 0.6), "hp", 120).map((v, i) => v * 0.7 + hum[i] * 0.3);
    const o = [fan(), fan()];
    add(o, [filt(white(r, n), "bp", 870, 40), filt(white(r, n), "bp", 873, 40)], 0, 0.15); // fan-blade whine
    for (let t = 0.8; t < dur - 0.8; t += between(r, 0.9, 2.6)) { // status blips: short, square-ish, in quick groups
      const f = [1320, 1760, 1980, 2640][floor(r() * 4)], reps = 1 + floor(r() * 3), p = between(r, -0.8, 0.8);
      for (let k = 0; k < reps; k++) add(o, pan(tone(0.05, () => f, (x) => gate(x, 0.035, 0.003, 0.01), [[1, 1], [3, 0.2]]), p), t + k * 0.07, 0.025);
    }
    return reverb(o, { rt: 0.7, size: 0.8, wet: 0.25 });
  }, -30),
  "amb-space": S(20, "deep calm space drone", (r, n) => {
    const dur = n / SR, o = [new Float32Array(n), new Float32Array(n)];
    for (const [k, f] of [55, 82.41, 110, 164.81, 220].entries()) { // detuned L/R pairs, slow swells
      const ph = r() * 10, voice = (det, off) => tone(dur, () => f + det, (t) => (0.5 / (k + 1)) * (0.6 + 0.4 * sin(TAU * 0.05 * (k + 1) * t + ph + off)));
      add(o, [voice(-0.12, 0), voice(0.15, 1)]);
    }
    const m = lfo(r, n, 0.1);
    add(o, [filt(pink(r, n), "lp", (t) => 150 + 250 * m[N(t)], 0.5), filt(pink(r, n), "lp", (t) => 160 + 250 * m[N(t)], 0.5)], 0, 0.12);
    for (const [k, f] of [329.63, 440, 493.88].entries()) { const sw = lfo(r, n, 0.06); add(o, pan(tone(dur, () => f, (t) => 0.05 * sw[N(t)] ** 2), k - 1)); } // faint high pad, slowly breathing
    add(o, [filt(pink(r, n), "bp", 2200, 1.5), filt(pink(r, n), "bp", 2300, 1.5)], 0, 0.015);
    return reverb(o, { rt: 4, size: 1.6, wet: 0.5, damp: 3000 });
  }, -30),
};

// ── finishing ───────────────────────────────────────────────────────────────────────────────────
const AMB_PRE = 3, AMB_XF = 2; // ambiences: discard reverb build-up, crossfade the loop point

/** max momentary (400 ms) or integrated K-weighted loudness, LUFS. */
const loudness = (ch, integrated) => {
  const k = ch.map((x) => filt(filt(x, "hs", 1681.97, 0.7071, 4), "hp", 38.13, 0.5));
  const sq = new Float64Array(k[0].length + 1);
  for (let i = 0; i < k[0].length; i++) sq[i + 1] = sq[i] + k[0][i] ** 2 + k[1][i] ** 2;
  const W = N(0.4), n = k[0].length;
  let ms = integrated ? sq[n] / n : 0;
  if (!integrated) for (let i = 0; i <= max(0, n - W); i += N(0.01)) ms = max(ms, (sq[min(n, i + W)] - sq[i]) / W);
  return -0.691 + 10 * Math.log10(ms + 1e-20);
};

const render = (name) => {
  const s = SFX[name], r = mulberry(hash(name)), amb = name.startsWith("amb-");
  // remove DC / sub rumble first, so an ambience's filter start-up transient is discarded with its pre-roll
  let ch = st(s.gen(r, N(amb ? s.dur + AMB_PRE + AMB_XF : s.dur))).map((x) => filt(filt(x, "hp", 22, 0.6), "hp", 22, 0.6));
  if (amb) ch = ch.map((x) => { // equal-power crossfade of the tail into the head → seamless loop
    const y = x.slice(N(AMB_PRE)), n = N(s.dur), X = N(AMB_XF);
    for (let i = 0; i < X; i++) { const u = i / X; y[i] = y[i] * sin((u * PI) / 2) + y[n + i] * cos((u * PI) / 2); }
    return y.slice(0, n);
  });
  if (!amb) for (const x of ch) for (let i = 0, f = N(min(0.3, s.dur * 0.25)); i < x.length; i++) x[i] *= rc(i / N(0.001)) * rc((x.length - 1 - i) / f);
  const peak = max(...ch.map((x) => x.reduce((m, v) => max(m, abs(v)), 0)));
  const lufs = loudness(ch, amb), gain = min(Math.pow(10, (s.lufs - lufs) / 20), Math.pow(10, s.peak / 20) / peak);
  return { ch: ch.map((x) => x.map((v) => v * gain)), lufs: lufs + 20 * Math.log10(gain), peak: 20 * Math.log10(peak * gain) };
};

const wav = (ch, r) => {
  const n = ch[0].length, b = Buffer.alloc(44 + n * 4);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 4, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) // TPDF dither
    b.writeInt16LE(max(-32768, min(32767, round(ch[c][i] * 32767 + r() - r()))), 44 + i * 4 + c * 2);
  return b;
};

/** Writes <outDir>/<name>.wav for every sound (or just `names`). Returns [{ name, file, lufs, peak }]. */
export const writeSfx = (outDir, names = Object.keys(SFX)) => {
  fs.mkdirSync(outDir, { recursive: true });
  return names.map((name) => {
    if (!SFX[name]) throw new Error(`unknown sfx "${name}". known: ${Object.keys(SFX).join(", ")}`);
    const { ch, lufs, peak } = render(name), file = path.join(outDir, `${name}.wav`);
    fs.writeFileSync(file, wav(ch, mulberry(hash(name) ^ 0x5eed)));
    return { name, file, lufs, peak };
  });
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [outDir, ...names] = process.argv.slice(2);
  if (!outDir) { console.error(`usage: npm run sfx <outDir> [names...]\n${Object.entries(SFX).map(([k, v]) => `  ${k.padEnd(16)} ${v.desc}`).join("\n")}`); process.exit(1); }
  const t0 = Date.now(), out = writeSfx(outDir, names.length ? names : undefined);
  for (const o of out) console.log(`  ${o.name.padEnd(16)} ${SFX[o.name].dur.toFixed(2).padStart(5)}s  ${o.lufs.toFixed(1).padStart(6)} LUFS${o.name.startsWith("amb-") ? " int" : " max"}  peak ${o.peak.toFixed(1)} dBFS`);
  console.log(`wrote ${out.length} sounds to ${outDir} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
