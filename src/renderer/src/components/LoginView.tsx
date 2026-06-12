import { useState } from 'react';
import type { AuthStatus } from '@shared/types';
import { SpotifyIcon } from './Icons';

interface LoginViewProps {
  auth: AuthStatus;
  initialClientId: string;
}

const REDIRECT_URI = 'http://127.0.0.1:53682/callback';

export default function LoginView({ auth, initialClientId }: LoginViewProps): JSX.Element {
  const [clientId, setClientId] = useState(initialClientId);
  const [copied, setCopied] = useState(false);

  const connect = (): void => {
    void window.miniplayer.auth.login(clientId);
  };

  return (
    <div className="app-no-drag thin-scroll flex h-full flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-4 text-center">
      <SpotifyIcon size={36} className="text-[#1db954]" />
      <h1 className="text-base font-bold">Spotify MiniPlayer PiP</h1>
      <p className="text-xs leading-relaxed opacity-60">
        Connect your Spotify account to see the current track with live synced lyrics. Create an app
        at{' '}
        <a
          href="https://developer.spotify.com/dashboard"
          target="_blank"
          rel="noreferrer"
          className="text-[#1db954] underline"
        >
          developer.spotify.com/dashboard
        </a>{' '}
        and add this Redirect URI:
      </p>
      <button
        onClick={() => {
          void navigator.clipboard.writeText(REDIRECT_URI);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded bg-white/10 px-2 py-1 font-mono text-[10px] transition hover:bg-white/20"
        title="Click to copy"
      >
        {copied ? 'Copied ✓' : REDIRECT_URI}
      </button>
      <input
        type="text"
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        placeholder="Spotify Client ID"
        spellCheck={false}
        className="w-full max-w-72 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-center font-mono text-xs outline-none transition focus:border-[#1db954]"
        style={{ userSelect: 'text' }}
      />
      <button
        onClick={connect}
        disabled={auth.pending || clientId.trim().length === 0}
        className="flex items-center gap-2 rounded-full bg-[#1db954] px-5 py-2 text-sm font-bold text-black transition hover:scale-105 hover:bg-[#1ed760] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <SpotifyIcon size={16} />
        {auth.pending ? 'Waiting for browser…' : 'Connect Spotify'}
      </button>
      {auth.error && <p className="max-w-72 text-xs text-red-400">{auth.error}</p>}
    </div>
  );
}
