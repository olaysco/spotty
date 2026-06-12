/**
 * Dependency-free pitch detection (YIN) and note math.
 * Pure functions so they can run in the renderer's audio loop and be
 * unit-tested in Node against synthesized waveforms.
 */

export interface PitchReading {
  /** Detected fundamental frequency, or null when no clear pitch. */
  freqHz: number | null;
  /** 0–1 confidence; ~0 for noise/silence, ~1 for a clean tone. */
  clarity: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * YIN pitch detector (de Cheveigné & Kawahara, 2002) with parabolic
 * interpolation. Works on a mono time-domain window.
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  minHz = 70,
  maxHz = 1000
): PitchReading {
  const n = samples.length;
  const tauMax = Math.min(Math.floor(sampleRate / minHz), Math.floor(n / 2));
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  if (tauMax <= tauMin) return { freqHz: null, clarity: 0 };

  // Quick silence gate.
  let power = 0;
  for (let i = 0; i < n; i++) power += samples[i] * samples[i];
  if (power / n < 1e-6) return { freqHz: null, clarity: 0 };

  // Difference function d(tau), then cumulative mean normalized d'(tau).
  const window = n - tauMax;
  const cmndf = new Float32Array(tauMax + 1);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let diff = 0;
    for (let i = 0; i < window; i++) {
      const delta = samples[i] - samples[i + tau];
      diff += delta * delta;
    }
    runningSum += diff;
    cmndf[tau] = runningSum === 0 ? 1 : (diff * tau) / runningSum;
  }

  // First minimum below the threshold, refined to the local minimum.
  const threshold = 0.15;
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmndf[t] < threshold) {
      while (t + 1 <= tauMax && cmndf[t + 1] < cmndf[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) {
    // No dip below threshold: report the best candidate with low clarity.
    let best = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t++) if (cmndf[t] < cmndf[best]) best = t;
    const clarity = 1 - cmndf[best];
    return clarity > 0.5
      ? { freqHz: sampleRate / best, clarity }
      : { freqHz: null, clarity: Math.max(0, clarity) };
  }

  // Parabolic interpolation around tau for sub-sample precision.
  let betterTau = tau;
  if (tau > tauMin && tau < tauMax) {
    const s0 = cmndf[tau - 1];
    const s1 = cmndf[tau];
    const s2 = cmndf[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tau + (s2 - s0) / denom;
  }

  return { freqHz: sampleRate / betterTau, clarity: 1 - cmndf[tau] };
}

/** Converts a frequency to a (fractional) MIDI note number. */
export function freqToMidi(freqHz: number): number {
  return 69 + 12 * Math.log2(freqHz / 440);
}

/** "A4", "C#3", … for a fractional MIDI value. */
export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

/** Cents away from the nearest equal-tempered note (-50..+50). */
export function centsOff(midi: number): number {
  return Math.round((midi - Math.round(midi)) * 100);
}

/**
 * Smallest pitch-class distance in semitones (octave-agnostic, 0–6).
 * Used to score the singer against the song's dominant pitch.
 */
export function pitchClassDistance(midiA: number, midiB: number): number {
  const diff = Math.abs(midiA - midiB) % 12;
  return Math.min(diff, 12 - diff);
}
