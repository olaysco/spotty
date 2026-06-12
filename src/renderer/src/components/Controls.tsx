import { useState } from 'react';
import type { PlaybackState } from '@shared/types';
import { NextIcon, PauseIcon, PlayIcon, PrevIcon, VolumeIcon } from './Icons';

interface ControlsProps {
  playback: PlaybackState;
  progressMs: number;
  /** Show the seek bar and volume control (expanded mode). */
  full?: boolean;
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function Controls({ playback, progressMs, full = false }: ControlsProps): JSX.Element {
  const [showVolume, setShowVolume] = useState(false);
  const duration = playback.track?.durationMs ?? 0;
  const command = window.miniplayer.playback.command;

  return (
    <div className="app-no-drag flex flex-col gap-1 px-4 pb-3 pt-1">
      {full && duration > 0 && (
        <div className="flex items-center gap-2 text-[10px] tabular-nums opacity-60">
          <span>{formatTime(progressMs)}</span>
          <input
            type="range"
            min={0}
            max={duration}
            value={Math.min(progressMs, duration)}
            onChange={(e) => void command({ type: 'seek', positionMs: Number(e.target.value) })}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-[var(--accent)]"
          />
          <span>{formatTime(duration)}</span>
        </div>
      )}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => void command({ type: 'previous' })}
          className="rounded-full p-1.5 opacity-70 transition hover:scale-110 hover:opacity-100"
          title="Previous track (Ctrl+Alt+←)"
        >
          <PrevIcon size={18} />
        </button>
        <button
          onClick={() => void command({ type: playback.isPlaying ? 'pause' : 'play' })}
          className="rounded-full bg-white p-2 text-black shadow-lg transition hover:scale-110"
          title="Play/Pause (Ctrl+Alt+Space)"
        >
          {playback.isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        <button
          onClick={() => void command({ type: 'next' })}
          className="rounded-full p-1.5 opacity-70 transition hover:scale-110 hover:opacity-100"
          title="Next track (Ctrl+Alt+→)"
        >
          <NextIcon size={18} />
        </button>
        {full && (
          <div className="relative">
            <button
              onClick={() => setShowVolume((v) => !v)}
              className="rounded-full p-1.5 opacity-70 transition hover:opacity-100"
              title="Volume"
            >
              <VolumeIcon size={16} />
            </button>
            {showVolume && playback.volumePercent !== null && (
              <div className="absolute bottom-full right-0 mb-2 rounded-lg bg-black/80 p-2 backdrop-blur">
                <input
                  type="range"
                  min={0}
                  max={100}
                  defaultValue={playback.volumePercent}
                  onChange={(e) => void command({ type: 'volume', percent: Number(e.target.value) })}
                  className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/20 accent-[var(--accent)]"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
