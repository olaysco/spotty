import type { LyricLine, LyricWord } from './types';

const LINE_TIMESTAMP = /^\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
const WORD_TIMESTAMP = /<(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;

function toMs(min: string, sec: string, frac: string | undefined): number {
  const fracMs = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
  return Number(min) * 60_000 + Number(sec) * 1000 + fracMs;
}

/**
 * Parses standard and enhanced LRC text into timed lyric lines.
 * Supports multiple timestamps per line and `<mm:ss.xx>` word-level tags.
 */
export function parseLrc(lrc: string, trackDurationMs?: number): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const raw of lrc.split(/\r?\n/)) {
    let rest = raw.trim();
    const timestamps: number[] = [];
    let match = rest.match(LINE_TIMESTAMP);
    while (match) {
      timestamps.push(toMs(match[1], match[2], match[3]));
      rest = rest.slice(match[0].length);
      match = rest.match(LINE_TIMESTAMP);
    }
    if (timestamps.length === 0) continue; // metadata tag or plain text line

    const words = parseWords(rest);
    const text = rest.replace(WORD_TIMESTAMP, '').replace(/\s+/g, ' ').trim();
    for (const startMs of timestamps) {
      lines.push({ startMs, endMs: 0, text, words: words.length > 0 ? words : undefined });
    }
  }

  lines.sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < lines.length; i++) {
    lines[i].endMs =
      i + 1 < lines.length
        ? lines[i + 1].startMs
        : Math.max(lines[i].startMs + 5000, trackDurationMs ?? 0);
  }
  return lines;
}

function parseWords(text: string): LyricWord[] {
  const words: LyricWord[] = [];
  WORD_TIMESTAMP.lastIndex = 0;
  let match = WORD_TIMESTAMP.exec(text);
  while (match) {
    const startMs = toMs(match[1], match[2], match[3]);
    const from = match.index + match[0].length;
    const next = WORD_TIMESTAMP.exec(text);
    const wordText = text.slice(from, next ? next.index : undefined).trim();
    if (wordText.length > 0) words.push({ startMs, text: wordText });
    match = next;
  }
  return words;
}

/** Returns the index of the line active at `positionMs`, or -1 before the first line. */
export function findActiveLine(lines: LyricLine[], positionMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].startMs <= positionMs) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
