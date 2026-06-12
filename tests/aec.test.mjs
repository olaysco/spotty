import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fft, DelayEstimator, EchoCanceller } from '../src/shared/aec.ts';
import { detectPitch } from '../src/shared/pitch.ts';

const RATE = 48000;

/** Deterministic PRNG so the synthetic room never flakes. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Music-ish reference: gated broadband noise plus tones, with note-length
 * on/off bursts so the envelopes have structure for delay estimation.
 */
function makeReference(samples, rnd) {
  const ref = new Float32Array(samples);
  const burst = Math.floor(0.15 * RATE);
  let on = true;
  let freq = 262;
  for (let i = 0; i < samples; i++) {
    if (i % burst === 0) {
      on = rnd() > 0.25;
      freq = 200 + Math.floor(rnd() * 6) * 55;
    }
    if (!on) continue;
    ref[i] =
      0.3 * Math.sin((2 * Math.PI * freq * i) / RATE) +
      0.25 * (rnd() * 2 - 1);
  }
  return ref;
}

/** Echo path: bulk delay plus a few decaying reflections. */
function makeEcho(ref, delay, taps) {
  const echo = new Float32Array(ref.length);
  for (const [offset, gain] of taps) {
    const d = delay + offset;
    for (let i = d; i < ref.length; i++) echo[i] += gain * ref[i - d];
  }
  return echo;
}

function power(x, from, to) {
  let p = 0;
  for (let i = from; i < to; i++) p += x[i] * x[i];
  return p / (to - from);
}

test('FFT round-trips and transforms an impulse to all ones', () => {
  const fft = new Fft(512);
  const rnd = mulberry32(7);
  const re = new Float32Array(512).map(() => rnd() * 2 - 1);
  const im = new Float32Array(512);
  const orig = Float32Array.from(re);
  fft.forward(re, im);
  fft.inverse(re, im);
  for (let i = 0; i < 512; i++) {
    assert.ok(Math.abs(re[i] - orig[i]) < 1e-4, `roundtrip drift at ${i}`);
  }

  const dre = new Float32Array(512);
  const dim = new Float32Array(512);
  dre[0] = 1;
  fft.forward(dre, dim);
  for (let k = 0; k < 512; k++) {
    assert.ok(Math.abs(dre[k] - 1) < 1e-5 && Math.abs(dim[k]) < 1e-5, `impulse bin ${k}`);
  }
});

test('delay estimator locks onto the echo delay', () => {
  const rnd = mulberry32(42);
  const samples = 3 * RATE;
  const DELAY = 6000;
  const ref = makeReference(samples, rnd);
  const mic = new Float32Array(samples);
  for (let i = DELAY; i < samples; i++) mic[i] = 0.5 * ref[i - DELAY] + 0.001 * (rnd() * 2 - 1);

  const est = new DelayEstimator(RATE);
  for (let off = 0; off + 1024 <= samples; off += 1024) {
    est.push(ref.subarray(off, off + 1024), mic.subarray(off, off + 1024));
  }
  assert.ok(est.delaySamples !== null, 'never locked');
  assert.ok(Math.abs(est.delaySamples - DELAY) <= 192, `locked at ${est.delaySamples}, true ${DELAY}`);
});

test('cancels speaker echo and preserves the singer', () => {
  const rnd = mulberry32(1337);
  const seconds = 6;
  const samples = seconds * RATE;
  const DELAY = 6000; // 125 ms
  const ref = makeReference(samples, rnd);
  const echo = makeEcho(ref, DELAY, [
    [0, 0.7],
    [180, 0.25],
    [450, 0.12]
  ]);

  const voiceStart = Math.floor(4.5 * RATE);
  const mic = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    mic[i] = echo[i] + 0.0005 * (rnd() * 2 - 1);
    if (i >= voiceStart) mic[i] += 0.25 * Math.sin((2 * Math.PI * 220 * i) / RATE);
  }

  const aec = new EchoCanceller(RATE);
  const cleaned = new Float32Array(samples);
  for (let off = 0; off + 1024 <= samples; off += 1024) {
    cleaned.set(aec.process(mic.subarray(off, off + 1024), ref.subarray(off, off + 1024)), off);
  }

  // Reflections drag the envelope centroid late; the canceller's PRE_DELAY
  // margin (512 samples) absorbs that, so the lock only needs to land
  // within it.
  const lockedMs = aec.delayMs;
  assert.ok(lockedMs !== null, 'delay never locked');
  assert.ok(Math.abs((lockedMs * RATE) / 1000 - DELAY) <= 512, `delay locked at ${lockedMs}ms`);

  // After ~3.5 s of convergence and before the voice starts, the residual
  // should be well below the echo that reached the mic.
  const from = Math.floor(3.5 * RATE);
  const to = Math.floor(4.4 * RATE);
  const erle = 10 * Math.log10(power(mic, from, to) / (power(cleaned, from, to) + 1e-12));
  assert.ok(erle > 10, `echo only reduced by ${erle.toFixed(1)} dB`);

  // The singer must survive double talk: pitch detectable and power kept.
  const win = Math.floor(5.5 * RATE);
  const { freqHz } = detectPitch(cleaned.subarray(win, win + 2048), RATE);
  assert.ok(freqHz !== null && Math.abs(freqHz - 220) < 5, `voice pitch lost: ${freqHz}`);
  const voicePower = (0.25 * 0.25) / 2; // RMS² of the 220 Hz sine
  const sungWindow = power(cleaned, Math.floor(5 * RATE), samples);
  assert.ok(sungWindow > 0.3 * voicePower, `voice suppressed: ${sungWindow} vs ${voicePower}`);
});

test('passes the mic through when there is no echo (headphones)', () => {
  const rnd = mulberry32(99);
  const samples = 3 * RATE;
  const ref = makeReference(samples, rnd);
  const mic = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    mic[i] = 0.05 * (rnd() * 2 - 1) + 0.2 * Math.sin((2 * Math.PI * 220 * i) / RATE);
  }

  const aec = new EchoCanceller(RATE);
  const cleaned = new Float32Array(samples);
  for (let off = 0; off + 1024 <= samples; off += 1024) {
    cleaned.set(aec.process(mic.subarray(off, off + 1024), ref.subarray(off, off + 1024)), off);
  }

  let diff = 0;
  for (let i = 0; i < samples; i++) {
    const d = cleaned[i] - mic[i];
    diff += d * d;
  }
  assert.ok(diff / samples < 0.05 * power(mic, 0, samples), 'voice was altered without echo');
});
