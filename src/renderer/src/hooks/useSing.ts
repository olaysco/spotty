import { useEffect, useRef, useState } from 'react';
import type { LyricLine } from '@shared/types';
import { centsOff, midiToNoteName, pitchClassDistance } from '@shared/pitch';
import { PitchTracker } from '@/lib/PitchTracker';

const TICK_MS = 50;
const RIBBON_SECONDS = 10;
/** Song readings within this window can match the singer (covers output latency + reaction time). */
const ALIGN_WINDOW_MS = 600;
/** Octave-agnostic match tolerance in semitones. */
const TUNE_TOLERANCE = 0.6;
/** Bleed detector: rolling window of instrumental frames (~10s) and onset/clear ratios. */
const BLEED_WINDOW = 200;
const BLEED_MIN_FRAMES = 40;
const BLEED_ON_RATIO = 0.65;
const BLEED_OFF_RATIO = 0.4;

export interface SingFrame {
  at: number; // performance.now()
  user: number | null; // fractional midi
  song: number | null;
}

export interface SingState {
  active: boolean;
  micError: string | null;
  /** True when system-audio capture works and tune scoring is real. */
  loopback: boolean;
  /** True while speaker audio is leaking into the mic; scoring is paused. */
  bleed: boolean;
  userNote: string | null;
  userCents: number;
  tunePct: number | null; // null until enough data / no loopback
  rhythmPct: number | null;
  grade: string | null;
  ribbon: SingFrame[];
}

interface Inputs {
  enabled: boolean;
  trackId: string | undefined;
  progressMs: number;
  isPlaying: boolean;
  lines: LyricLine[];
}

function gradeFor(tune: number | null, rhythm: number | null): string | null {
  const score = tune !== null && rhythm !== null ? 0.6 * tune + 0.4 * rhythm : (rhythm ?? tune);
  if (score === null) return null;
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'E';
}

/**
 * Drives Sing Mode: captures mic (and system-audio loopback when available),
 * tracks both pitches ~20×/s, and scores tune (pitch-class match against the
 * song within an alignment window) and rhythm (singing during lyric lines).
 */
export function useSing({ enabled, trackId, progressMs, isPlaying, lines }: Inputs): SingState {
  const [state, setState] = useState<SingState>({
    active: false,
    micError: null,
    loopback: false,
    bleed: false,
    userNote: null,
    userCents: 0,
    tunePct: null,
    rhythmPct: null,
    grade: null,
    ribbon: []
  });

  // Live values readable from the interval without re-subscribing.
  const live = useRef({ progressMs, isPlaying, lines });
  live.current = { progressMs, isPlaying, lines };

  const scores = useRef({ tuneHits: 0, tuneTotal: 0, voiced: 0, lineTime: 0 });

  // Reset the score when the song changes.
  useEffect(() => {
    scores.current = { tuneHits: 0, tuneTotal: 0, voiced: 0, lineTime: 0 };
  }, [trackId]);

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, active: false, micError: null, bleed: false, ribbon: [] }));
      return;
    }

    let mic: PitchTracker | null = null;
    let loop: PitchTracker | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;
    const ribbon: SingFrame[] = [];
    const songHistory: { at: number; midi: number }[] = [];
    // Bleed detector: Chromium's echoCancellation can't remove Spotify's
    // output (it never sees it as its own playback), so speaker sound can
    // reach the mic and score as perfect singing. During instrumental
    // passages nobody should be tracking the song's pitch — a sustained
    // match there means the mic is hearing the speakers.
    const instrumental: boolean[] = [];
    let bleed = false;

    const start = async (): Promise<void> => {
      try {
        mic = await PitchTracker.fromMic();
      } catch (err) {
        if (!disposed) {
          setState((s) => ({
            ...s,
            active: false,
            micError: err instanceof Error ? err.message : 'Microphone unavailable'
          }));
        }
        return;
      }
      try {
        loop = await PitchTracker.fromLoopback();
      } catch {
        loop = null; // No system-audio capture: rhythm-only scoring.
      }
      if (disposed) {
        mic?.dispose();
        loop?.dispose();
        return;
      }

      timer = setInterval(() => {
        const now = performance.now();
        const user = mic!.read();
        const song = loop?.read() ?? null;

        ribbon.push({ at: now, user: user.midi, song: song?.midi ?? null });
        while (ribbon.length > 0 && now - ribbon[0].at > RIBBON_SECONDS * 1000) ribbon.shift();
        if (song?.midi != null) {
          songHistory.push({ at: now, midi: song.midi });
          while (songHistory.length > 0 && now - songHistory[0].at > ALIGN_WINDOW_MS) songHistory.shift();
        }

        const { progressMs: pos, isPlaying: playing, lines: lrc } = live.current;
        const inLyricLine =
          playing && lrc.some((l) => l.text.length > 0 && pos >= l.startMs && pos < l.endMs);

        if (playing && !inLyricLine && song?.midi != null) {
          instrumental.push(
            user.midi != null && pitchClassDistance(user.midi, song.midi) <= TUNE_TOLERANCE
          );
          if (instrumental.length > BLEED_WINDOW) instrumental.shift();
          if (instrumental.length >= BLEED_MIN_FRAMES) {
            const ratio = instrumental.filter(Boolean).length / instrumental.length;
            if (!bleed && ratio >= BLEED_ON_RATIO) {
              bleed = true;
              // Whatever accumulated so far was inflated by the speakers.
              scores.current = { tuneHits: 0, tuneTotal: 0, voiced: 0, lineTime: 0 };
            } else if (bleed && ratio <= BLEED_OFF_RATIO) {
              bleed = false;
            }
          }
        }

        const s = scores.current;
        if (inLyricLine && !bleed) {
          s.lineTime++;
          if (user.midi != null) s.voiced++;
          if (loop && user.midi != null) {
            s.tuneTotal++;
            const hit = songHistory.some((h) => pitchClassDistance(user.midi!, h.midi) <= TUNE_TOLERANCE);
            if (hit) s.tuneHits++;
          }
        }

        const tunePct = s.tuneTotal >= 20 ? Math.round((100 * s.tuneHits) / s.tuneTotal) : null;
        const rhythmPct = s.lineTime >= 20 ? Math.round((100 * s.voiced) / s.lineTime) : null;
        setState({
          active: true,
          micError: null,
          loopback: loop !== null,
          bleed,
          userNote: user.midi != null ? midiToNoteName(user.midi) : null,
          userCents: user.midi != null ? centsOff(user.midi) : 0,
          tunePct,
          rhythmPct,
          grade: gradeFor(tunePct, rhythmPct),
          ribbon: [...ribbon]
        });
      }, TICK_MS);
    };

    void start();
    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
      mic?.dispose();
      loop?.dispose();
    };
  }, [enabled]);

  return state;
}
