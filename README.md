# Spotify MiniPlayer PiP 🎵

A floating, always-on-top Picture-in-Picture music player for Spotify with **real-time synchronized lyrics**. Keep a tiny, beautiful lyric window above your work, games, or browser — without the full Spotify app on screen.

![Electron](https://img.shields.io/badge/Electron-React%20%2B%20TypeScript-1db954) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Floating PiP window** — frameless, always-on-top, draggable anywhere, resizable, remembers its position and size.
- **Real-time synced lyrics** — line-by-line highlighting that follows playback, with smooth auto-scrolling, previous/upcoming line context, instrumental-break indicators, and graceful fallback to static lyrics when sync isn't available (with a clear notice).
- **Three window modes** — Small (lyrics only), Compact (artwork + controls + lyrics), Expanded (large lyric view with seek bar and volume).
- **Three lyric styles** — classic line highlight, karaoke word-by-word highlighting, and a center-focused single-line mode.
- **Playback controls** — play/pause, next/previous, seek bar, and volume (expanded mode).
- **Spotify-inspired design** — rounded corners, glassmorphism backdrop blurred from the album artwork, dynamic accent color extracted from the cover, dark and light themes.
- **Click-through mode** — let mouse clicks pass through the overlay (restore via the tray icon or `Ctrl+Alt+P`).
- **Customization** — opacity, font size, lyric alignment (left/center/right), lock position, animations toggle, launch at startup, start hidden.
- **Track-change toast** — a brief popup with artwork and artist when a new song starts.
- **Sing Mode** 🎤 — click the mic icon to score your singing on any track. Your voice is pitch-tracked from the microphone (YIN), and where supported (macOS 13+/Windows) the app also captures **system audio** to pitch-track the song itself. You get a live pitch ribbon (your trail vs. the song's), a note + cents readout, a **Tune** score (octave-agnostic pitch-class match against the song during lyric lines, with a latency-tolerant alignment window), a **Rhythm** score (singing during the synced lyric lines), and a running grade. **Wear headphones** — otherwise the mic hears the song instead of you. Honest limitation: the song's pitch is the *dominant pitch of the full mix*, which usually follows the vocal during sung lines but isn't an isolated vocal melody, so treat Tune as "in tune with the song," not note-perfect melody grading. Without system-audio capture it falls back to rhythm-only scoring and says so. All audio stays on your machine — nothing is recorded or uploaded.
- **Global shortcuts** — control playback from anywhere:

  | Shortcut | Action |
  | --- | --- |
  | `Ctrl/Cmd+Alt+Space` | Play / Pause |
  | `Ctrl/Cmd+Alt+→` / `←` | Next / Previous track |
  | `Ctrl/Cmd+Alt+P` | Show / hide the PiP window |
  | `Ctrl/Cmd+Alt+=` / `-` | Increase / decrease lyric font size |

## Setup

### 1. Create a Spotify app

The MiniPlayer talks directly to the Spotify Web API with your own (free) app credentials:

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and click **Create app**.
2. Give it any name/description.
3. Add this **Redirect URI**: `http://127.0.0.1:53682/callback`
4. Select **Web API** and save.
5. Copy the **Client ID** (no client secret needed — the app uses the secure PKCE flow).

> Playback *control* (play/pause/skip/seek/volume) requires **Spotify Premium**. Track detection and lyrics work on free accounts, but Spotify must be playing on some device.

### 2. Install & run

```bash
npm install
npm run dev        # development with hot reload
```

On first launch, paste your Client ID and click **Connect Spotify** — your browser opens for the one-time login, then the PiP window takes over.

### 3. Build installers

```bash
npm run dist:win   # Windows installer (NSIS)
npm run dist       # current platform
```

## How it works

- **Main process** (`src/main/`) handles Spotify OAuth (Authorization Code + PKCE over a loopback redirect, tokens encrypted with the OS keychain via `safeStorage`), polls the Spotify Web API once per second for playback state, fetches lyrics, and manages the frameless window, tray icon, and global shortcuts.
- **Lyrics** come from [LRCLIB](https://lrclib.net) (free, no API key, synced LRC support) with exact-match lookup, fuzzy search fallback with duration matching, and per-track caching. The parser supports standard and enhanced (word-timed) LRC.
- **Renderer** (`src/renderer/`) is React + Tailwind. It interpolates the playback position between polls (~80 ms ticks) so the highlighted lyric line stays smoothly in sync without hammering the API.
- **Performance**: no heavy runtime dependencies, one lightweight poll per second, mid-size artwork only, and lyric caching — designed to stay quiet in the background.

## Project structure

```
src/
├── main/        # Electron main: window, tray, shortcuts, OAuth, Spotify + lyrics services
├── preload/     # contextBridge API (typed, isolated)
├── renderer/    # React UI: lyrics view, controls, settings, login
└── shared/      # Types, IPC channel names, LRC parser
```

## Roadmap

- Lyric translation and romanization (JA/KO/ZH) for language learners
- Per-monitor placement memory and corner snapping
- Additional lyric providers (Musixmatch) behind a provider interface
- Borderless overlay mode for games and videos

## License

MIT
