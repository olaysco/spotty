import { detectPitch, freqToMidi, type PitchReading } from '@shared/pitch';
import { EchoCanceller } from '@shared/aec';

export interface EngineReading extends PitchReading {
  /** Fractional MIDI note, null when unvoiced. */
  midi: number | null;
}

const WINDOW = 2048;
const CLARITY_GATE = 0.6;
/** Must be a multiple of the canceller's 256-sample block. */
const CHUNK = 1024;

class Ring {
  private readonly buf: Float32Array;
  private written = 0;

  constructor(size: number) {
    this.buf = new Float32Array(size);
  }

  write(x: Float32Array): void {
    const mask = this.buf.length - 1;
    for (let i = 0; i < x.length; i++) this.buf[(this.written + i) & mask] = x[i];
    this.written += x.length;
  }

  /** Copies the most recent out.length samples; false until enough data. */
  latest(out: Float32Array): boolean {
    if (this.written < out.length) return false;
    const mask = this.buf.length - 1;
    const start = this.written - out.length;
    for (let i = 0; i < out.length; i++) out[i] = this.buf[(start + i) & mask];
    return true;
  }
}

/**
 * Captures the microphone and, when available, system-audio loopback
 * (macOS 13+ via ScreenCaptureKit, Windows via WASAPI; the main process
 * auto-grants the request with `audio: 'loopback'`). Both run through one
 * audio graph so the EchoCanceller can subtract the speakers' sound from
 * the mic before pitch detection — Chromium's own echoCancellation can't
 * do this because Spotify's audio is not Chromium's playback.
 *
 * A ScriptProcessorNode (not an AudioWorklet) taps the graph: it is
 * deprecated but keeps the canceller importable/testable as a plain
 * module, and nothing here is rendered to the speakers, so its
 * main-thread latency doesn't matter.
 */
export class SingEngine {
  private readonly micRing = new Ring(8192);
  private readonly songRing = new Ring(8192);
  private readonly window = new Float32Array(WINDOW);

  private constructor(
    private readonly ctx: AudioContext,
    private readonly streams: MediaStream[],
    private readonly proc: ScriptProcessorNode,
    private readonly aec: EchoCanceller | null,
    /** True when system-audio capture works and tune scoring is real. */
    readonly loopback: boolean
  ) {}

  static async create(): Promise<SingEngine> {
    // Loopback first: it's auto-granted (no prompt) and decides the mic
    // constraints below.
    let loopStream: MediaStream | null = null;
    try {
      loopStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      for (const track of loopStream.getVideoTracks()) {
        track.stop();
        loopStream.removeTrack(track);
      }
      if (loopStream.getAudioTracks().length === 0) {
        loopStream = null;
      }
    } catch {
      loopStream = null;
    }

    let micStream: MediaStream;
    try {
      // With loopback we cancel echo ourselves and need the mic linear:
      // noise suppression and AGC distort the echo path the NLMS filter
      // models. Without loopback there is nothing to cancel against, so
      // let the browser clean the signal.
      const processed = loopStream === null;
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: processed,
          noiseSuppression: processed,
          autoGainControl: processed
        },
        video: false
      });
    } catch (err) {
      loopStream?.getTracks().forEach((t) => t.stop());
      throw err;
    }

    const ctx = new AudioContext();
    void ctx.resume();
    const micSrc = ctx.createMediaStreamSource(micStream);
    const streams = loopStream ? [micStream, loopStream] : [micStream];

    let proc: ScriptProcessorNode;
    let aec: EchoCanceller | null = null;
    let engine: SingEngine;
    if (loopStream) {
      const loopSrc = ctx.createMediaStreamSource(loopStream);
      const merger = ctx.createChannelMerger(2);
      micSrc.connect(merger, 0, 0);
      loopSrc.connect(merger, 0, 1);
      proc = ctx.createScriptProcessor(CHUNK, 2, 1);
      merger.connect(proc);
      aec = new EchoCanceller(ctx.sampleRate);
      engine = new SingEngine(ctx, streams, proc, aec, true);
      proc.onaudioprocess = (e) => {
        const mic = e.inputBuffer.getChannelData(0);
        const ref = e.inputBuffer.getChannelData(1);
        engine.micRing.write(aec!.process(mic, ref));
        engine.songRing.write(ref);
      };
    } else {
      proc = ctx.createScriptProcessor(CHUNK, 1, 1);
      micSrc.connect(proc);
      engine = new SingEngine(ctx, streams, proc, null, false);
      proc.onaudioprocess = (e) => {
        engine.micRing.write(e.inputBuffer.getChannelData(0));
      };
    }

    // A ScriptProcessor only runs while wired to the destination.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    proc.connect(sink);
    sink.connect(ctx.destination);
    return engine;
  }

  /** The singer, with any speaker echo subtracted. */
  readUser(): EngineReading {
    return this.read(this.micRing);
  }

  /** The song's dominant pitch, or null without loopback capture. */
  readSong(): EngineReading | null {
    return this.loopback ? this.read(this.songRing) : null;
  }

  /** Echo reduction in dB once the canceller locks, else null. */
  get erleDb(): number | null {
    return this.aec?.erleDb ?? null;
  }

  private read(ring: Ring): EngineReading {
    if (!ring.latest(this.window)) return { freqHz: null, clarity: 0, midi: null };
    const reading = detectPitch(this.window, this.ctx.sampleRate);
    const voiced = reading.freqHz !== null && reading.clarity >= CLARITY_GATE;
    return { ...reading, midi: voiced && reading.freqHz ? freqToMidi(reading.freqHz) : null };
  }

  dispose(): void {
    this.proc.onaudioprocess = null;
    this.proc.disconnect();
    for (const stream of this.streams) {
      for (const track of stream.getTracks()) track.stop();
    }
    void this.ctx.close();
  }
}
