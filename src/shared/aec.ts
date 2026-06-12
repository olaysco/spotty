/**
 * Dependency-free acoustic echo cancellation for Sing Mode.
 *
 * Chromium's built-in echoCancellation only removes audio Chromium itself
 * plays. Spotify is a separate app, so its sound reaches the microphone
 * through the speakers with no reference for the browser to subtract —
 * and the mic then scores the song as perfect singing. We *do* have the
 * reference: the system-audio loopback capture. This module subtracts it:
 * a bulk-delay estimator (envelope cross-correlation) aligns the reference
 * with the acoustic path, and a partitioned-block frequency-domain NLMS
 * filter (overlap-save FLMS) models speaker → room → mic and cancels it.
 *
 * Pure and dependency-free so it can run inside the renderer's audio
 * callback and be unit-tested in Node against synthesized signals.
 */

/** Iterative radix-2 FFT with precomputed twiddles and bit-reversal. */
export class Fft {
  readonly n: number;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;
  private readonly rev: Uint32Array;

  constructor(n: number) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error('FFT size must be a power of 2');
    this.n = n;
    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((2 * Math.PI * i) / n);
    }
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      this.rev[i] = r;
    }
  }

  forward(re: Float32Array, im: Float32Array): void {
    const { n, rev, cos, sin } = this;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        const ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const tre = re[j + half] * cos[k] + im[j + half] * sin[k];
          const tim = im[j + half] * cos[k] - re[j + half] * sin[k];
          re[j + half] = re[j] - tre;
          im[j + half] = im[j] - tim;
          re[j] += tre;
          im[j] += tim;
        }
      }
    }
  }

  inverse(re: Float32Array, im: Float32Array): void {
    const { n } = this;
    for (let i = 0; i < n; i++) im[i] = -im[i];
    this.forward(re, im);
    const s = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] *= s;
      im[i] *= -s;
    }
  }
}

/** Envelope decimation block: 64 samples ≈ 1.3 ms of delay resolution. */
const ENV_BLOCK = 64;
const MIN_CORRELATION = 0.4;
/** Candidates must agree within ±3 env blocks before a delay locks. */
const CANDIDATE_AGREEMENT = 3;
/** Locked delay only moves when a new stable estimate differs this much. */
const RELOCK_SAMPLES = 1024;

/**
 * Estimates the bulk delay between the loopback reference and its echo in
 * the microphone by cross-correlating amplitude envelopes. With headphones
 * (no echo) the envelopes never correlate and no delay locks — the
 * canceller then passes the mic through untouched.
 */
export class DelayEstimator {
  private readonly maxLag: number;
  private readonly win: number;
  private readonly mask: number;
  private readonly refEnv: Float32Array;
  private readonly micEnv: Float32Array;
  private count = 0;
  private sinceEstimate = 0;
  private lastCandidate: number | null = null;
  private lockedSamples: number | null = null;
  private generation = 0;

  constructor(sampleRate: number, maxDelaySec = 0.7, windowSec = 0.5) {
    this.maxLag = Math.ceil((maxDelaySec * sampleRate) / ENV_BLOCK);
    this.win = Math.ceil((windowSec * sampleRate) / ENV_BLOCK);
    const size = 1 << Math.ceil(Math.log2(this.maxLag + this.win + 2));
    this.mask = size - 1;
    this.refEnv = new Float32Array(size);
    this.micEnv = new Float32Array(size);
  }

  /** Feed matching ref/mic blocks; length must be a multiple of 64. */
  push(ref: Float32Array, mic: Float32Array): void {
    for (let off = 0; off + ENV_BLOCK <= ref.length; off += ENV_BLOCK) {
      let r = 0;
      let m = 0;
      for (let i = 0; i < ENV_BLOCK; i++) {
        r += Math.abs(ref[off + i]);
        m += Math.abs(mic[off + i]);
      }
      const idx = this.count & this.mask;
      this.refEnv[idx] = r / ENV_BLOCK;
      this.micEnv[idx] = m / ENV_BLOCK;
      this.count++;
      if (++this.sinceEstimate >= this.win >> 1 && this.count >= this.maxLag + this.win) {
        this.sinceEstimate = 0;
        this.estimate();
      }
    }
  }

  /** Locked bulk delay in samples, or null until envelopes correlate. */
  get delaySamples(): number | null {
    return this.lockedSamples;
  }

  /** Bumps whenever the locked delay changes so the filter can reset. */
  get delayGeneration(): number {
    return this.generation;
  }

  private estimate(): void {
    const { win, maxLag, mask, refEnv, micEnv } = this;
    const end = this.count;
    let micMean = 0;
    for (let i = end - win; i < end; i++) micMean += micEnv[i & mask];
    micMean /= win;
    let micVar = 0;
    for (let i = end - win; i < end; i++) {
      const d = micEnv[i & mask] - micMean;
      micVar += d * d;
    }
    if (micVar < 1e-12) {
      this.lastCandidate = null;
      return;
    }

    let bestLag = -1;
    let bestCorr = 0;
    for (let lag = 0; lag <= maxLag; lag++) {
      let refMean = 0;
      for (let i = end - win; i < end; i++) refMean += refEnv[(i - lag) & mask];
      refMean /= win;
      let cross = 0;
      let refVar = 0;
      for (let i = end - win; i < end; i++) {
        const rd = refEnv[(i - lag) & mask] - refMean;
        cross += rd * (micEnv[i & mask] - micMean);
        refVar += rd * rd;
      }
      if (refVar < 1e-12) continue;
      const corr = cross / Math.sqrt(refVar * micVar);
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    if (bestLag < 0 || bestCorr < MIN_CORRELATION) {
      this.lastCandidate = null;
      return;
    }
    if (this.lastCandidate !== null && Math.abs(bestLag - this.lastCandidate) <= CANDIDATE_AGREEMENT) {
      const samples = bestLag * ENV_BLOCK;
      if (this.lockedSamples === null || Math.abs(samples - this.lockedSamples) > RELOCK_SAMPLES) {
        this.lockedSamples = samples;
        this.generation++;
      }
    }
    this.lastCandidate = bestLag;
  }
}

const BLOCK = 256;
const FFT_N = 512;
const PARTITIONS = 16; // 4096 taps ≈ 85 ms of echo tail at 48 kHz
const MU = 0.4;
/** Start the filter slightly before the estimated delay (estimator has ±block resolution). */
const PRE_DELAY = 512;
const REG = 0.05;
const RING_SIZE = 1 << 16;
/** Blocks of full-rate adaptation before the double-talk guard engages. */
const WARMUP_BLOCKS = 100;
const ERLE_SMOOTH = 0.98;

/**
 * Partitioned-block frequency-domain NLMS echo canceller. Feed equal-length
 * mic/reference chunks (multiples of 256 samples); returns the mic with the
 * reference's echo subtracted. Passes the mic through unchanged until the
 * delay estimator locks — i.e. it is a no-op when there is no echo.
 */
export class EchoCanceller {
  private readonly fft = new Fft(FFT_N);
  private readonly estimator: DelayEstimator;
  private readonly ring = new Float32Array(RING_SIZE);
  private written = 0;
  private generation = -1;
  private delay = 0;

  private readonly xRe: Float32Array[] = [];
  private readonly xIm: Float32Array[] = [];
  private readonly wRe: Float32Array[] = [];
  private readonly wIm: Float32Array[] = [];
  private head = 0;
  private constrainIdx = 0;
  private adaptedBlocks = 0;

  private readonly accRe = new Float32Array(FFT_N);
  private readonly accIm = new Float32Array(FFT_N);
  private readonly eRe = new Float32Array(FFT_N);
  private readonly eIm = new Float32Array(FFT_N);
  private readonly sumPow = new Float32Array(FFT_N);
  private readonly tmpRe = new Float32Array(FFT_N);
  private readonly tmpIm = new Float32Array(FFT_N);

  private micPow = 0;
  private errPow = 0;
  private erleBlocks = 0;

  readonly sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.estimator = new DelayEstimator(sampleRate);
    for (let p = 0; p < PARTITIONS; p++) {
      this.xRe.push(new Float32Array(FFT_N));
      this.xIm.push(new Float32Array(FFT_N));
      this.wRe.push(new Float32Array(FFT_N));
      this.wIm.push(new Float32Array(FFT_N));
    }
  }

  /** Locked echo-path delay in ms, or null while passing through. */
  get delayMs(): number | null {
    const d = this.estimator.delaySamples;
    return d === null ? null : (1000 * d) / this.sampleRate;
  }

  /** Smoothed echo-return-loss enhancement in dB, null until measurable. */
  get erleDb(): number | null {
    if (this.erleBlocks < 40 || this.errPow <= 0) return null;
    return 10 * Math.log10((this.micPow + 1e-12) / (this.errPow + 1e-12));
  }

  process(mic: Float32Array, ref: Float32Array): Float32Array {
    if (mic.length !== ref.length || mic.length % BLOCK !== 0) {
      throw new Error('EchoCanceller.process needs equal-length chunks in multiples of 256');
    }
    const out = new Float32Array(mic.length);
    for (let off = 0; off < mic.length; off += BLOCK) {
      this.block(
        mic.subarray(off, off + BLOCK),
        ref.subarray(off, off + BLOCK),
        out.subarray(off, off + BLOCK)
      );
    }
    return out;
  }

  private resetFilter(): void {
    for (let p = 0; p < PARTITIONS; p++) {
      this.xRe[p].fill(0);
      this.xIm[p].fill(0);
      this.wRe[p].fill(0);
      this.wIm[p].fill(0);
    }
    this.head = 0;
    this.constrainIdx = 0;
    this.adaptedBlocks = 0;
    this.micPow = 0;
    this.errPow = 0;
    this.erleBlocks = 0;
  }

  private block(mic: Float32Array, ref: Float32Array, out: Float32Array): void {
    const mask = RING_SIZE - 1;
    for (let i = 0; i < BLOCK; i++) this.ring[(this.written + i) & mask] = ref[i];
    this.written += BLOCK;
    this.estimator.push(ref, mic);

    const locked = this.estimator.delaySamples;
    if (locked === null) {
      out.set(mic);
      return;
    }
    if (this.estimator.delayGeneration !== this.generation) {
      this.generation = this.estimator.delayGeneration;
      this.delay = Math.max(0, locked - PRE_DELAY);
      this.resetFilter();
    }
    const start = this.written - this.delay - FFT_N;
    if (start < 0 || start < this.written - RING_SIZE) {
      out.set(mic);
      return;
    }

    // Newest partition: FFT of the delayed reference segment (overlap-save).
    this.head = (this.head + PARTITIONS - 1) % PARTITIONS;
    const xr = this.xRe[this.head];
    const xi = this.xIm[this.head];
    let segPow = 0;
    for (let i = 0; i < FFT_N; i++) {
      const v = this.ring[(start + i) & mask];
      xr[i] = v;
      xi[i] = 0;
      segPow += v * v;
    }
    this.fft.forward(xr, xi);

    // ŷ = Σ_p X(age p) · W_p, then e = mic − ŷ (last half is the linear
    // part). Unfilled history slots are all-zero and contribute nothing.
    const { accRe, accIm } = this;
    accRe.fill(0);
    accIm.fill(0);
    for (let p = 0; p < PARTITIONS; p++) {
      const idx = (this.head + p) % PARTITIONS;
      const pxr = this.xRe[idx];
      const pxi = this.xIm[idx];
      const pwr = this.wRe[p];
      const pwi = this.wIm[p];
      for (let k = 0; k < FFT_N; k++) {
        accRe[k] += pxr[k] * pwr[k] - pxi[k] * pwi[k];
        accIm[k] += pxr[k] * pwi[k] + pxi[k] * pwr[k];
      }
    }
    this.fft.inverse(accRe, accIm);
    let yPow = 0;
    let ePow = 0;
    let mPow = 0;
    for (let i = 0; i < BLOCK; i++) {
      const y = accRe[BLOCK + i];
      const e = mic[i] - y;
      out[i] = e;
      yPow += y * y;
      ePow += e * e;
      mPow += mic[i] * mic[i];
    }

    if (segPow / FFT_N < 1e-7) return; // reference silent: nothing to learn from

    // ERLE diagnostics (voice in the mic drags this down; it's indicative only).
    this.micPow = ERLE_SMOOTH * this.micPow + (1 - ERLE_SMOOTH) * (mPow / BLOCK);
    this.errPow = ERLE_SMOOTH * this.errPow + (1 - ERLE_SMOOTH) * (ePow / BLOCK);
    this.erleBlocks++;

    // Soft double-talk guard: once converged, singing inflates e relative
    // to ŷ — shrink the step so the voice doesn't smear the filter.
    let mu = MU;
    if (this.adaptedBlocks > WARMUP_BLOCKS) {
      mu = MU * Math.max(0.05, yPow / (yPow + ePow + 1e-12));
    }
    this.adaptedBlocks++;

    const { sumPow, eRe, eIm } = this;
    sumPow.fill(REG);
    for (let p = 0; p < PARTITIONS; p++) {
      const pxr = this.xRe[p];
      const pxi = this.xIm[p];
      for (let k = 0; k < FFT_N; k++) sumPow[k] += pxr[k] * pxr[k] + pxi[k] * pxi[k];
    }
    eRe.fill(0);
    eIm.fill(0);
    for (let i = 0; i < BLOCK; i++) eRe[BLOCK + i] = out[i];
    this.fft.forward(eRe, eIm);
    for (let p = 0; p < PARTITIONS; p++) {
      const idx = (this.head + p) % PARTITIONS;
      const pxr = this.xRe[idx];
      const pxi = this.xIm[idx];
      const pwr = this.wRe[p];
      const pwi = this.wIm[p];
      for (let k = 0; k < FFT_N; k++) {
        const g = mu / sumPow[k];
        pwr[k] += g * (pxr[k] * eRe[k] + pxi[k] * eIm[k]);
        pwi[k] += g * (pxr[k] * eIm[k] - pxi[k] * eRe[k]);
      }
    }

    // Gradient constraint on one partition per block (rotating) keeps the
    // overlap-save filter from going circular.
    const cp = this.constrainIdx;
    this.constrainIdx = (this.constrainIdx + 1) % PARTITIONS;
    this.tmpRe.set(this.wRe[cp]);
    this.tmpIm.set(this.wIm[cp]);
    this.fft.inverse(this.tmpRe, this.tmpIm);
    for (let i = BLOCK; i < FFT_N; i++) {
      this.tmpRe[i] = 0;
      this.tmpIm[i] = 0;
    }
    this.fft.forward(this.tmpRe, this.tmpIm);
    this.wRe[cp].set(this.tmpRe);
    this.wIm[cp].set(this.tmpIm);
  }
}
