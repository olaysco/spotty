import { useEffect, useState, type CSSProperties } from 'react';
import type { AuthStatus } from '@shared/types';
import Controls from './components/Controls';
import { NoteIcon } from './components/Icons';
import LoginView from './components/LoginView';
import LyricsView from './components/LyricsView';
import SettingsPanel from './components/SettingsPanel';
import TitleBar from './components/TitleBar';
import TrackToast from './components/TrackToast';
import { useAccentColor } from './hooks/useAccentColor';
import { useLyrics } from './hooks/useLyrics';
import { usePlayback } from './hooks/usePlayback';
import { useSettings } from './hooks/useSettings';

export default function App(): JSX.Element {
  const { settings, update } = useSettings();
  const { playback, progressMs } = usePlayback();
  const { lyrics, loading } = useLyrics(playback?.track?.id);
  const accent = useAccentColor(playback?.track?.artworkUrl);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void window.miniplayer.auth.status().then(setAuth);
    return window.miniplayer.auth.onChange(setAuth);
  }, []);

  const track = playback?.track ?? null;
  const mode = settings.windowMode;
  const dark = settings.theme === 'dark';
  const bgAlpha = settings.translucent ? (dark ? 0.62 : 0.55) : dark ? 0.96 : 0.97;

  return (
    <div
      className={`${dark ? 'dark text-white' : 'text-neutral-900'} ${settings.animations ? '' : 'no-animations'} group app-drag relative flex h-full flex-col overflow-hidden rounded-2xl border ${
        dark ? 'border-white/10' : 'border-black/10'
      }`}
      style={{ '--accent': accent, '--lyric-size': `${settings.fontSize}px` } as CSSProperties}
    >
      {/* Blurred artwork backdrop with theme-tinted glass overlay. */}
      <div className="absolute inset-0 -z-10">
        {track?.artworkUrl && (
          <img
            src={track.artworkUrl}
            alt=""
            className="h-full w-full scale-150 object-cover opacity-60 blur-2xl"
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: dark ? `rgba(12, 12, 14, ${bgAlpha})` : `rgba(248, 248, 250, ${bgAlpha})` }}
        />
      </div>

      {auth === null ? null : !auth.authenticated ? (
        <LoginView auth={auth} initialClientId={settings.spotifyClientId} />
      ) : (
        <>
          <TitleBar settings={settings} updateSettings={update} onOpenSettings={() => setSettingsOpen(true)} />
          {/* Compact/expanded modes already show the track in the header. */}
          {mode === 'small' && <TrackToast track={track} />}

          {!track ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center opacity-50">
              <NoteIcon size={24} />
              <p className="text-xs">
                Nothing playing.
                <br />
                Start playback in Spotify on any device.
              </p>
            </div>
          ) : (
            <>
              {mode !== 'small' && (
                <div className="flex shrink-0 items-center gap-3 px-4 pb-1">
                  {settings.showArtwork && track.artworkUrl && (
                    <img
                      src={track.artworkUrl}
                      alt=""
                      className={`rounded-lg shadow-lg ${mode === 'expanded' ? 'h-14 w-14' : 'h-11 w-11'}`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-bold ${mode === 'expanded' ? 'text-base' : 'text-sm'}`}>{track.title}</p>
                    <p className="truncate text-xs opacity-60">{track.artists.join(', ')}</p>
                  </div>
                </div>
              )}

              <div className="min-h-0 flex-1">
                <LyricsView
                  lyrics={lyrics}
                  loading={loading}
                  progressMs={progressMs}
                  settings={settings}
                  dense={mode === 'small'}
                />
              </div>

              {mode === 'small' ? (
                <p className="shrink-0 truncate px-3 pb-1.5 text-center text-[10px] opacity-50">
                  {track.title} — {track.artists.join(', ')}
                </p>
              ) : (
                playback && <Controls playback={playback} progressMs={progressMs} full={mode === 'expanded'} />
              )}
            </>
          )}

          {settingsOpen && (
            <SettingsPanel settings={settings} updateSettings={update} onClose={() => setSettingsOpen(false)} />
          )}
        </>
      )}
    </div>
  );
}
