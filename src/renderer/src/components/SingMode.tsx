import { useEffect, useRef } from 'react';
import type { SingState } from '@/hooks/useSing';

/**
 * Sing Mode panel: a scrolling pitch ribbon (your voice in the accent
 * color, the song's dominant pitch in white) with live note readout and
 * tune/rhythm scores.
 */
export default function SingMode({ sing }: { sing: SingState }): JSX.Element {
  if (sing.micError) {
    return (
      <div className="app-no-drag mx-3 mb-1 rounded-xl bg-black/30 px-3 py-2 text-center text-[11px] text-red-300">
        Microphone unavailable: {sing.micError}
      </div>
    );
  }
  if (!sing.active) {
    return (
      <div className="mx-3 mb-1 rounded-xl bg-black/30 px-3 py-2 text-center text-[11px] opacity-60">
        Starting Sing Mode…
      </div>
    );
  }
  return (
    <div className="app-no-drag mx-3 mb-1 rounded-xl bg-black/30 px-3 pb-2 pt-1.5">
      <div className="mb-1 flex items-center justify-between text-[10px]">
        <span className="flex items-center gap-2">
          <ScoreChip label="Tune" value={sing.tunePct} unavailable={!sing.loopback} />
          <ScoreChip label="Rhythm" value={sing.rhythmPct} />
          {sing.grade && (
            <span className="rounded-full px-1.5 py-px font-black" style={{ background: 'var(--accent)', color: '#000' }}>
              {sing.grade}
            </span>
          )}
        </span>
        <span className="font-mono tabular-nums opacity-80">
          {sing.userNote ? `${sing.userNote} ${sing.userCents >= 0 ? '+' : ''}${sing.userCents}¢` : '—'}
        </span>
      </div>
      <PitchRibbon sing={sing} />
      {!sing.loopback && (
        <p className="mt-1 text-center text-[9px] opacity-40">
          System-audio capture unavailable — scoring rhythm only. Wear headphones for best results.
        </p>
      )}
    </div>
  );
}

function ScoreChip({ label, value, unavailable = false }: { label: string; value: number | null; unavailable?: boolean }): JSX.Element {
  return (
    <span className="rounded-full bg-white/10 px-1.5 py-px">
      {label}{' '}
      <span className="font-bold tabular-nums">{unavailable ? 'n/a' : value === null ? '…' : `${value}%`}</span>
    </span>
  );
}

const RIBBON_SECONDS = 10;

function PitchRibbon({ sing }: { sing: SingState }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const singRef = useRef(sing);
  singRef.current = sing;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const draw = (): void => {
      const { ribbon } = singRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Adaptive vertical range: center on the data, min 1.5 octaves.
      const midis = ribbon.flatMap((f) => [f.user, f.song]).filter((m): m is number => m !== null);
      const mid = midis.length > 0 ? midis.reduce((a, b) => a + b, 0) / midis.length : 60;
      const span = 18; // semitones shown
      const lo = mid - span / 2;
      const now = performance.now();
      const x = (at: number): number => w - ((now - at) / (RIBBON_SECONDS * 1000)) * w;
      const y = (midi: number): number => h - ((midi - lo) / span) * h;

      // Faint octave grid lines on C.
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let m = Math.ceil(lo / 12) * 12; m < lo + span; m += 12) {
        ctx.beginPath();
        ctx.moveTo(0, y(m));
        ctx.lineTo(w, y(m));
        ctx.stroke();
      }

      const trail = (key: 'song' | 'user', style: string, width: number): void => {
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        let pen = false;
        for (const f of ribbon) {
          const m = f[key];
          if (m === null) {
            pen = false;
            continue;
          }
          const px = x(f.at);
          const py = Math.min(h - 1, Math.max(1, y(m)));
          if (pen) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
          pen = true;
        }
        ctx.stroke();
      };

      trail('song', 'rgba(255,255,255,0.35)', 2);
      const accent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#1db954';
      trail('user', accent, 2.5);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="h-16 w-full" />;
}
