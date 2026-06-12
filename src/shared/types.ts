export interface TrackInfo {
  id: string;
  title: string;
  artists: string[];
  album: string;
  artworkUrl: string | null;
  durationMs: number;
}

export interface PlaybackState {
  track: TrackInfo | null;
  isPlaying: boolean;
  /** Playback position at the moment the snapshot was taken. */
  progressMs: number;
  /** Epoch ms when the snapshot was taken; lets the renderer interpolate smoothly. */
  fetchedAt: number;
  volumePercent: number | null;
  deviceName: string | null;
}

export interface LyricWord {
  startMs: number;
  text: string;
}

export interface LyricLine {
  startMs: number;
  endMs: number;
  text: string;
  /** Word-level timings when the source provides enhanced LRC. */
  words?: LyricWord[];
}

export type LyricsSource = 'lrclib' | 'none';

export interface LyricsData {
  trackId: string;
  /** True when line timestamps are available. */
  synced: boolean;
  lines: LyricLine[];
  /** Plain, unsynchronized lyrics fallback. */
  plain: string | null;
  /** True for instrumental tracks (provider says there are no lyrics at all). */
  instrumental: boolean;
  source: LyricsSource;
}

export type WindowMode = 'small' | 'compact' | 'expanded';
export type LyricStyle = 'line' | 'karaoke' | 'center';
export type LyricAlignment = 'left' | 'center' | 'right';
export type Theme = 'dark' | 'light';

export interface Settings {
  spotifyClientId: string;
  windowMode: WindowMode;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  lockPosition: boolean;
  /** Whole-window opacity, 0.3–1. */
  opacity: number;
  theme: Theme;
  lyricStyle: LyricStyle;
  lyricAlignment: LyricAlignment;
  /** Base lyric font size in px. */
  fontSize: number;
  animations: boolean;
  launchAtStartup: boolean;
  startHidden: boolean;
  showArtwork: boolean;
  /** Translucent “glass” background vs. solid. */
  translucent: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  spotifyClientId: '',
  windowMode: 'compact',
  alwaysOnTop: true,
  clickThrough: false,
  lockPosition: false,
  opacity: 1,
  theme: 'dark',
  lyricStyle: 'line',
  lyricAlignment: 'center',
  fontSize: 18,
  animations: true,
  launchAtStartup: false,
  startHidden: false,
  showArtwork: true,
  translucent: true
};

export type PlaybackCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; positionMs: number }
  | { type: 'volume'; percent: number };

export interface AuthStatus {
  authenticated: boolean;
  /** Set while the OAuth flow is waiting for the browser redirect. */
  pending: boolean;
  error: string | null;
}

/** Sizes (and minimums) for each window mode. */
export const MODE_SIZES: Record<WindowMode, { width: number; height: number; minWidth: number; minHeight: number }> = {
  small: { width: 340, height: 160, minWidth: 260, minHeight: 120 },
  compact: { width: 380, height: 460, minWidth: 300, minHeight: 360 },
  expanded: { width: 520, height: 640, minWidth: 380, minHeight: 480 }
};
