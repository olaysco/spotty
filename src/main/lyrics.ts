import type { LyricsData, TrackInfo } from '@shared/types';
import { parseLrc } from '@shared/lrc';

const LRCLIB = 'https://lrclib.net/api';
const USER_AGENT = 'SpotifyMiniPlayerPiP/0.1.0 (https://github.com/olaysco/spotty)';
const CACHE_LIMIT = 50;

interface LrclibRecord {
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/**
 * Fetches lyrics from LRCLIB (free, key-less, supports synced LRC).
 * Falls back from exact match to fuzzy search, and from synced to plain
 * lyrics. Results are cached per track id.
 */
export class LyricsService {
  private readonly cache = new Map<string, LyricsData>();

  async getLyrics(track: TrackInfo): Promise<LyricsData> {
    const cached = this.cache.get(track.id);
    if (cached) return cached;

    const record = (await this.getExact(track)) ?? (await this.search(track));
    const data = this.toLyricsData(track, record);

    this.cache.set(track.id, data);
    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return data;
  }

  private toLyricsData(track: TrackInfo, record: LrclibRecord | null): LyricsData {
    if (!record) {
      return { trackId: track.id, synced: false, lines: [], plain: null, instrumental: false, source: 'none' };
    }
    if (record.syncedLyrics) {
      const lines = parseLrc(record.syncedLyrics, track.durationMs);
      if (lines.length > 0) {
        return { trackId: track.id, synced: true, lines, plain: record.plainLyrics, instrumental: false, source: 'lrclib' };
      }
    }
    return {
      trackId: track.id,
      synced: false,
      lines: [],
      plain: record.plainLyrics,
      instrumental: record.instrumental,
      source: 'lrclib'
    };
  }

  private async getExact(track: TrackInfo): Promise<LrclibRecord | null> {
    const params = new URLSearchParams({
      track_name: track.title,
      artist_name: track.artists[0] ?? '',
      album_name: track.album,
      duration: String(Math.round(track.durationMs / 1000))
    });
    return this.fetchJson<LrclibRecord>(`${LRCLIB}/get?${params}`);
  }

  private async search(track: TrackInfo): Promise<LrclibRecord | null> {
    const params = new URLSearchParams({
      track_name: track.title,
      artist_name: track.artists[0] ?? ''
    });
    const results = await this.fetchJson<LrclibRecord[]>(`${LRCLIB}/search?${params}`);
    if (!results || results.length === 0) return null;

    const targetSec = track.durationMs / 1000;
    // Prefer synced lyrics with a close duration match.
    const scored = results
      .map((r) => ({
        record: r,
        score: (r.syncedLyrics ? 0 : 1000) + Math.abs((r.duration ?? 0) - targetSec)
      }))
      .sort((a, b) => a.score - b.score);
    const best = scored[0];
    // Reject wildly mismatched durations (> 10s off) to avoid desynced lyrics.
    if (Math.abs((best.record.duration ?? 0) - targetSec) > 10 && best.record.syncedLyrics) return null;
    return best.record;
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch (err) {
      console.warn('Lyrics request failed:', err);
      return null;
    }
  }
}
