import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPitch,
  freqToMidi,
  midiToNoteName,
  centsOff,
  pitchClassDistance
} from '../src/shared/pitch.ts';

const RATE = 44100;

function sine(freq, length = 2048, amplitude = 0.5) {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / RATE);
  return samples;
}

test('detects pure tones across the vocal range', () => {
  for (const freq of [110, 220, 440, 880]) {
    const { freqHz, clarity } = detectPitch(sine(freq), RATE);
    assert.ok(freqHz !== null, `no pitch for ${freq}Hz`);
    assert.ok(Math.abs(freqHz - freq) < freq * 0.01, `${freq}Hz detected as ${freqHz}`);
    assert.ok(clarity > 0.85, `low clarity ${clarity} for ${freq}Hz`);
  }
});

test('detects the fundamental of a harmonic-rich tone', () => {
  const samples = new Float32Array(2048);
  for (let i = 0; i < samples.length; i++) {
    const t = i / RATE;
    samples[i] =
      0.5 * Math.sin(2 * Math.PI * 220 * t) +
      0.3 * Math.sin(2 * Math.PI * 440 * t) +
      0.2 * Math.sin(2 * Math.PI * 660 * t);
  }
  const { freqHz } = detectPitch(samples, RATE);
  assert.ok(freqHz !== null && Math.abs(freqHz - 220) < 5, `expected ~220Hz, got ${freqHz}`);
});

test('rejects silence and noise', () => {
  assert.equal(detectPitch(new Float32Array(2048), RATE).freqHz, null);
  let seed = 42;
  const noise = new Float32Array(2048);
  for (let i = 0; i < noise.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    noise[i] = (seed / 0x7fffffff) * 0.6 - 0.3;
  }
  const reading = detectPitch(noise, RATE);
  assert.ok(reading.clarity < 0.6, `noise scored clarity ${reading.clarity}`);
});

test('note math converts correctly', () => {
  assert.equal(Math.round(freqToMidi(440)), 69);
  assert.equal(midiToNoteName(69), 'A4');
  assert.equal(midiToNoteName(60), 'C4');
  assert.equal(centsOff(69.25), 25);
  assert.equal(centsOff(68.8), -20);
});

test('pitch-class distance is octave-agnostic and symmetric', () => {
  assert.equal(pitchClassDistance(60, 72), 0); // C4 vs C5
  assert.equal(pitchClassDistance(60, 61), 1);
  assert.equal(pitchClassDistance(60, 71), 1); // C vs B wraps
  assert.ok(pitchClassDistance(69, 69.4) < 0.5);
});
