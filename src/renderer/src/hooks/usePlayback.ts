import { useEffect, useRef, useState } from 'react';
import type { PlaybackState } from '@shared/types';

const TICK_MS = 80;

/**
 * Subscribes to playback snapshots from the main process and interpolates
 * the playback position between polls so lyrics stay in smooth sync.
 */
export function usePlayback(): { playback: PlaybackState | null; progressMs: number } {
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [progressMs, setProgressMs] = useState(0);
  const playbackRef = useRef<PlaybackState | null>(null);

  useEffect(() => {
    const apply = (state: PlaybackState): void => {
      playbackRef.current = state;
      setPlayback(state);
    };
    void window.miniplayer.playback.get().then(apply);
    return window.miniplayer.playback.onState(apply);
  }, []);

  useEffect(() => {
    const tick = (): void => {
      const state = playbackRef.current;
      if (!state || !state.track) {
        setProgressMs(0);
        return;
      }
      const elapsed = state.isPlaying ? Date.now() - state.fetchedAt : 0;
      setProgressMs(Math.min(state.track.durationMs, state.progressMs + elapsed));
    };
    const timer = setInterval(tick, TICK_MS);
    tick();
    return () => clearInterval(timer);
  }, []);

  return { playback, progressMs };
}
