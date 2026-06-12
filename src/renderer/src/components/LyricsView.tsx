import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LyricLine, LyricsData, Settings } from '@shared/types';
import { findActiveLine } from '@shared/lrc';
import { NoteIcon } from './Icons';

interface LyricsViewProps {
  lyrics: LyricsData | null;
  loading: boolean;
  progressMs: number;
  settings: Settings;
  /** Compact rendering for the "small" window mode. */
  dense?: boolean;
}

const ALIGN_CLASS = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;
const JUSTIFY_CLASS = { left: 'justify-start', center: 'justify-center', right: 'justify-end' } as const;

export default function LyricsView({ lyrics, loading, progressMs, settings, dense = false }: LyricsViewProps): JSX.Element {
  if (loading) {
    return <CenteredMessage subtle>Looking for lyrics…</CenteredMessage>;
  }
  if (!lyrics || lyrics.source === 'none') {
    return (
      <CenteredMessage subtle>
        <NoteIcon size={22} className="mx-auto mb-2 opacity-50" />
        No lyrics found for this track
      </CenteredMessage>
    );
  }
  if (lyrics.instrumental) {
    return <InstrumentalIndicator label="Instrumental" />;
  }
  if (!lyrics.synced) {
    return <PlainLyrics text={lyrics.plain} settings={settings} />;
  }
  if (settings.lyricStyle === 'center') {
    return <CenterFocusedLyrics lines={lyrics.lines} progressMs={progressMs} settings={settings} dense={dense} />;
  }
  return <ScrollingLyrics lines={lyrics.lines} progressMs={progressMs} settings={settings} dense={dense} />;
}

function CenteredMessage({ children, subtle = false }: { children: ReactNode; subtle?: boolean }): JSX.Element {
  return (
    <div
      className={`flex h-full items-center justify-center px-6 text-center text-sm ${
        subtle ? 'text-white/40 dark:text-white/40' : ''
      }`}
    >
      <div>{children}</div>
    </div>
  );
}

function InstrumentalIndicator({ label }: { label?: string }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-white/60">
      <div className="flex items-end gap-1.5" style={{ color: 'var(--accent)' }}>
        {[0, 1, 2].map((i) => (
          <NoteIcon key={i} size={18 + i * 4} className="note-dot" />
        ))}
      </div>
      {label && <span className="text-xs uppercase tracking-widest opacity-60">{label}</span>}
    </div>
  );
}

function PlainLyrics({ text, settings }: { text: string | null; settings: Settings }): JSX.Element {
  if (!text) {
    return <CenteredMessage subtle>No lyrics found for this track</CenteredMessage>;
  }
  return (
    <div className="app-no-drag thin-scroll h-full overflow-y-auto px-5 py-3" style={{ userSelect: 'text' }}>
      <p className="mb-3 text-center text-[10px] uppercase tracking-widest opacity-40">
        Synced lyrics unavailable — showing static lyrics
      </p>
      <pre
        className={`whitespace-pre-wrap font-sans leading-relaxed opacity-80 ${ALIGN_CLASS[settings.lyricAlignment]}`}
        style={{ fontSize: 'calc(var(--lyric-size) * 0.85)' }}
      >
        {text}
      </pre>
    </div>
  );
}

/** Treats empty lines and long silent gaps as instrumental breaks. */
function isInstrumentalBreak(lines: LyricLine[], index: number, progressMs: number): boolean {
  if (index === -1) return lines.length > 0 && lines[0].startMs - progressMs > 4000;
  const line = lines[index];
  return line.text.length === 0 && line.endMs - line.startMs > 4000;
}

function ScrollingLyrics({
  lines,
  progressMs,
  settings,
  dense
}: {
  lines: LyricLine[];
  progressMs: number;
  settings: Settings;
  dense: boolean;
}): JSX.Element {
  const activeIndex = findActiveLine(lines, progressMs);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const target = lineRefs.current[Math.max(0, activeIndex)];
    if (!container || !target) return;
    setOffset(target.offsetTop + target.offsetHeight / 2 - container.clientHeight / 2);
  }, [activeIndex, lines, settings.fontSize]);

  const visibleRange = dense ? 1 : 3;

  return (
    <div ref={containerRef} className="relative h-full overflow-hidden">
      {/* Soft fade at top and bottom so lines appear/disappear gracefully. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-black/25 to-transparent dark:from-black/25" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-black/25 to-transparent dark:from-black/25" />
      <div
        className="absolute inset-x-0 px-5 transition-transform duration-500 ease-out will-change-transform"
        style={{ transform: `translateY(${-offset}px)` }}
      >
        {lines.map((line, i) => {
          const distance = activeIndex === -1 ? i + 1 : Math.abs(i - activeIndex);
          const isActive = i === activeIndex;
          const hidden = distance > visibleRange + 2;
          return (
            <div
              key={`${line.startMs}-${i}`}
              ref={(el) => {
                lineRefs.current[i] = el;
              }}
              className={`py-[0.35em] leading-snug transition-all duration-300 ${ALIGN_CLASS[settings.lyricAlignment]}`}
              style={{
                fontSize: isActive ? 'calc(var(--lyric-size) * 1.12)' : 'var(--lyric-size)',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--accent)' : undefined,
                opacity: hidden ? 0 : isActive ? 1 : Math.max(0.15, 0.55 - distance * 0.12)
              }}
            >
              {line.text.length === 0 ? (
                isActive && isInstrumentalBreak(lines, i, progressMs) ? (
                  <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="note-dot inline-block h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: `${d * 0.25}s` }} />
                    ))}
                  </span>
                ) : (
                  ' '
                )
              ) : isActive && settings.lyricStyle === 'karaoke' ? (
                <KaraokeLine line={line} progressMs={progressMs} />
              ) : (
                line.text
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Word-by-word highlighting. Uses enhanced-LRC word timings when present,
 * otherwise distributes the line duration across words proportionally to
 * their length.
 */
function KaraokeLine({ line, progressMs }: { line: LyricLine; progressMs: number }): JSX.Element {
  const words = useMemo(() => {
    if (line.words && line.words.length > 0) {
      return line.words.map((w, i, arr) => ({
        text: w.text,
        startMs: w.startMs,
        endMs: i + 1 < arr.length ? arr[i + 1].startMs : line.endMs
      }));
    }
    const tokens = line.text.split(/\s+/).filter(Boolean);
    const totalChars = tokens.reduce((sum, t) => sum + t.length, 0) || 1;
    const duration = Math.max(1, line.endMs - line.startMs);
    let cursor = line.startMs;
    return tokens.map((text) => {
      const startMs = cursor;
      cursor += (text.length / totalChars) * duration;
      return { text, startMs, endMs: cursor };
    });
  }, [line]);

  return (
    <span>
      {words.map((word, i) => {
        const sung = progressMs >= word.startMs;
        const current = sung && progressMs < word.endMs;
        return (
          <span key={i}>
            <span
              className="transition-opacity duration-150"
              style={{
                opacity: sung ? 1 : 0.35,
                textShadow: current ? '0 0 12px color-mix(in srgb, var(--accent) 60%, transparent)' : undefined
              }}
            >
              {word.text}
            </span>
            {i < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </span>
  );
}

/** Shows only the active line, large and centered, with the next line dimmed. */
function CenterFocusedLyrics({
  lines,
  progressMs,
  settings,
  dense
}: {
  lines: LyricLine[];
  progressMs: number;
  settings: Settings;
  dense: boolean;
}): JSX.Element {
  const activeIndex = findActiveLine(lines, progressMs);
  const active = activeIndex >= 0 ? lines[activeIndex] : null;
  const next = lines.slice(activeIndex + 1).find((l) => l.text.length > 0) ?? null;
  const showBreak = isInstrumentalBreak(lines, activeIndex, progressMs);

  return (
    <div className={`flex h-full flex-col ${JUSTIFY_CLASS.center} items-stretch gap-2 px-5 py-2`}>
      <div
        key={activeIndex}
        className={`animate-fade-slide-in ${ALIGN_CLASS[settings.lyricAlignment]} leading-snug`}
        style={{
          fontSize: dense ? 'var(--lyric-size)' : 'calc(var(--lyric-size) * 1.3)',
          fontWeight: 700,
          color: 'var(--accent)'
        }}
      >
        {showBreak || !active || active.text.length === 0 ? (
          <span className="inline-flex items-center gap-1.5">
            {[0, 1, 2].map((d) => (
              <span key={d} className="note-dot inline-block h-2 w-2 rounded-full bg-current" style={{ animationDelay: `${d * 0.25}s` }} />
            ))}
          </span>
        ) : (
          active.text
        )}
      </div>
      {!dense && next && (
        <div
          className={`${ALIGN_CLASS[settings.lyricAlignment]} leading-snug opacity-40`}
          style={{ fontSize: 'var(--lyric-size)' }}
        >
          {next.text}
        </div>
      )}
    </div>
  );
}
