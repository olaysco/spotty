import type { PlaybackCommand, PlaybackState, TrackInfo } from '@shared/types';
import type { SpotifyAuth } from './auth';

const API = 'https://api.spotify.com/v1';
const POLL_INTERVAL_MS = 1000;

interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string; width: number }[] };
}

interface SpotifyPlayerResponse {
  is_playing: boolean;
  progress_ms: number | null;
  item: SpotifyTrack | null;
  currently_playing_type: string;
  device: { name: string; volume_percent: number | null } | null;
}

/**
 * Polls the Spotify Web API for the current playback state and exposes
 * minimal playback controls. Emits a state callback on every poll and a
 * track callback whenever the playing track changes.
 */
export class SpotifyService {
  private timer: NodeJS.Timeout | null = null;
  private lastTrackId: string | null = null;
  private backoffUntil = 0;
  private state: PlaybackState = {
    track: null,
    isPlaying: false,
    progressMs: 0,
    fetchedAt: Date.now(),
    volumePercent: null,
    deviceName: null
  };

  onState: ((state: PlaybackState) => void) | null = null;
  onTrackChange: ((track: TrackInfo | null) => void) | null = null;

  constructor(private readonly auth: SpotifyAuth) {}

  getState(): PlaybackState {
    return this.state;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    void this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async command(cmd: PlaybackCommand): Promise<void> {
    const calls: Record<PlaybackCommand['type'], () => Promise<Response | null>> = {
      play: () => this.request('PUT', '/me/player/play'),
      pause: () => this.request('PUT', '/me/player/pause'),
      next: () => this.request('POST', '/me/player/next'),
      previous: () => this.request('POST', '/me/player/previous'),
      seek: () =>
        cmd.type === 'seek'
          ? this.request('PUT', `/me/player/seek?position_ms=${Math.max(0, Math.round(cmd.positionMs))}`)
          : Promise.resolve(null),
      volume: () =>
        cmd.type === 'volume'
          ? this.request('PUT', `/me/player/volume?volume_percent=${Math.min(100, Math.max(0, Math.round(cmd.percent)))}`)
          : Promise.resolve(null)
    };
    await calls[cmd.type]();
    // Optimistically update local state so the UI reacts before the next poll.
    if (cmd.type === 'play' || cmd.type === 'pause') {
      this.publish({ ...this.state, isPlaying: cmd.type === 'play', progressMs: this.currentProgress(), fetchedAt: Date.now() });
    } else if (cmd.type === 'seek') {
      this.publish({ ...this.state, progressMs: cmd.positionMs, fetchedAt: Date.now() });
    }
    setTimeout(() => void this.poll(), 250);
  }

  async togglePlayPause(): Promise<void> {
    await this.command({ type: this.state.isPlaying ? 'pause' : 'play' });
  }

  private currentProgress(): number {
    if (!this.state.isPlaying) return this.state.progressMs;
    return this.state.progressMs + (Date.now() - this.state.fetchedAt);
  }

  private async poll(): Promise<void> {
    if (Date.now() < this.backoffUntil || !this.auth.authenticated) return;
    const res = await this.request('GET', '/me/player');
    if (!res) return;

    if (res.status === 204) {
      // No active device.
      this.publish({ track: null, isPlaying: false, progressMs: 0, fetchedAt: Date.now(), volumePercent: null, deviceName: null });
      return;
    }
    if (!res.ok) return;

    const body = (await res.json().catch(() => null)) as SpotifyPlayerResponse | null;
    if (!body) return;

    const item = body.currently_playing_type === 'track' ? body.item : null;
    const track: TrackInfo | null = item
      ? {
          id: item.id,
          title: item.name,
          artists: item.artists.map((a) => a.name),
          album: item.album.name,
          artworkUrl: pickArtwork(item.album.images),
          durationMs: item.duration_ms
        }
      : null;

    this.publish({
      track,
      isPlaying: body.is_playing,
      progressMs: body.progress_ms ?? 0,
      fetchedAt: Date.now(),
      volumePercent: body.device?.volume_percent ?? null,
      deviceName: body.device?.name ?? null
    });
  }

  private publish(state: PlaybackState): void {
    this.state = state;
    this.onState?.(state);
    const trackId = state.track?.id ?? null;
    if (trackId !== this.lastTrackId) {
      this.lastTrackId = trackId;
      this.onTrackChange?.(state.track);
    }
  }

  private async request(method: string, path: string): Promise<Response | null> {
    const token = await this.auth.getAccessToken();
    if (!token) return null;
    try {
      const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After') ?? '5');
        this.backoffUntil = Date.now() + retryAfter * 1000;
      }
      return res;
    } catch (err) {
      // Network hiccups are expected; back off briefly instead of spamming.
      this.backoffUntil = Date.now() + 5000;
      console.warn(`Spotify request ${method} ${path} failed:`, err);
      return null;
    }
  }
}

function pickArtwork(images: { url: string; width: number }[]): string | null {
  if (!images || images.length === 0) return null;
  // Prefer a mid-size image (~300px) to keep memory low.
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= 300) ?? sorted[sorted.length - 1]).url;
}
