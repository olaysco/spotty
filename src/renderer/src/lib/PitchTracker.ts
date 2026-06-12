import { detectPitch, freqToMidi, type PitchReading } from '@shared/pitch';

export interface TrackerReading extends PitchReading {
  /** Fractional MIDI note, null when unvoiced. */
  midi: number | null;
}

const FFT_SIZE = 2048;
const CLARITY_GATE = 0.6;

/**
 * Wraps an audio source (microphone or system-audio loopback) with an
 * AnalyserNode and runs YIN on demand. Reading ~20×/s on 2048 samples is
 * cheap enough to stay off a worker.
 */
export class PitchTracker {
  private constructor(
    private readonly ctx: AudioContext,
    private readonly analyser: AnalyserNode,
    private readonly stream: MediaStream
  ) {}

  private readonly buffer = new Float32Array(FFT_SIZE);

  /** Listens to the user's microphone. */
  static async fromMic(): Promise<PitchTracker> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
    return PitchTracker.fromStream(stream);
  }

  /**
   * Listens to what the computer is playing via display-media loopback
   * (macOS 13+ via ScreenCaptureKit, Windows via WASAPI). The main process
   * auto-grants the request with `audio: 'loopback'`; we immediately drop
   * the mandatory video track.
   */
  static async fromLoopback(): Promise<PitchTracker> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    for (const track of stream.getVideoTracks()) {
      track.stop();
      stream.removeTrack(track);
    }
    if (stream.getAudioTracks().length === 0) {
      throw new Error('System audio loopback returned no audio track.');
    }
    return PitchTracker.fromStream(stream);
  }

  private static fromStream(stream: MediaStream): PitchTracker {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    source.connect(analyser);
    return new PitchTracker(ctx, analyser, stream);
  }

  read(): TrackerReading {
    this.analyser.getFloatTimeDomainData(this.buffer);
    const reading = detectPitch(this.buffer, this.ctx.sampleRate);
    const voiced = reading.freqHz !== null && reading.clarity >= CLARITY_GATE;
    return { ...reading, midi: voiced && reading.freqHz ? freqToMidi(reading.freqHz) : null };
  }

  dispose(): void {
    for (const track of this.stream.getTracks()) track.stop();
    void this.ctx.close();
  }
}
