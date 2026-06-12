import { safeStorage, shell } from 'electron';
import { createServer, type Server } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { JsonStore } from './store';

const AUTH_PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${AUTH_PORT}/callback`;
const SCOPES = ['user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing'];

interface StoredTokens {
  /** safeStorage-encrypted (base64) or plain JSON payload, see `encrypted`. */
  payload: string | null;
  encrypted: boolean;
}

interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms at which the access token expires. */
  expiresAt: number;
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The token endpoint rejected the grant itself (revoked/expired) — not transient. */
class TokenRejectedError extends Error {}

/**
 * Spotify OAuth using the Authorization Code + PKCE flow (no client secret).
 * Opens the system browser and captures the redirect on a local loopback server.
 * Tokens are encrypted with the OS keychain via safeStorage when available.
 */
export class SpotifyAuth {
  private readonly store = new JsonStore<StoredTokens>('tokens.json', { payload: null, encrypted: false });
  private tokens: TokenSet | null = null;
  private server: Server | null = null;
  private refreshPromise: Promise<void> | null = null;
  private nextRefreshAt = 0;
  pending = false;

  /** Fired when auth state changes outside an explicit IPC call (e.g. forced sign-out). */
  onChanged: (() => void) | null = null;

  constructor(private readonly getClientId: () => string) {}

  /**
   * Loads persisted tokens. Must be called after the app `ready` event,
   * since safeStorage is only reliable once the keychain is available.
   */
  init(): void {
    this.tokens = this.loadTokens();
  }

  get authenticated(): boolean {
    return this.tokens !== null;
  }

  static get redirectUri(): string {
    return REDIRECT_URI;
  }

  /** Starts the interactive login flow; resolves once tokens are obtained. */
  async login(): Promise<void> {
    const clientId = this.getClientId().trim();
    if (!clientId) throw new Error('Spotify Client ID is not configured.');

    const verifier = base64url(randomBytes(48));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    const state = base64url(randomBytes(16));

    const code = await this.waitForCallback(clientId, challenge, state);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier
    });
    const tokens = await this.requestTokens(body);
    this.setTokens(tokens);
  }

  logout(): void {
    this.tokens = null;
    this.store.replace({ payload: null, encrypted: false });
    this.onChanged?.();
  }

  /** Forces the next getAccessToken() to refresh (e.g. after an API 401). */
  invalidateAccessToken(): void {
    if (this.tokens) this.tokens.expiresAt = 0;
  }

  /** Returns a valid access token, refreshing it if it is about to expire. */
  async getAccessToken(): Promise<string | null> {
    if (!this.tokens) return null;
    if (Date.now() < this.tokens.expiresAt - 60_000) return this.tokens.accessToken;

    if (Date.now() >= this.nextRefreshAt) {
      this.refreshPromise ??= this.refresh().finally(() => {
        this.refreshPromise = null;
      });
      await this.refreshPromise;
    }
    return this.tokens?.accessToken ?? null;
  }

  private async refresh(): Promise<void> {
    if (!this.tokens) return;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refreshToken,
      client_id: this.getClientId().trim()
    });
    try {
      const next = await this.requestTokens(body, this.tokens.refreshToken);
      this.setTokens(next);
      this.nextRefreshAt = 0;
    } catch (err) {
      if (err instanceof TokenRejectedError) {
        // The refresh token itself was revoked or expired — reconnect needed.
        console.error('Spotify rejected the refresh token, signing out:', err);
        this.logout();
      } else {
        // Network blip / Spotify hiccup (laptop wake is a classic): keep the
        // tokens and retry shortly instead of destroying the session.
        console.warn('Token refresh failed transiently, will retry:', err);
        this.nextRefreshAt = Date.now() + 10_000;
      }
    }
  }

  private async requestTokens(body: URLSearchParams, fallbackRefreshToken?: string): Promise<TokenSet> {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Spotify token request failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    const refreshToken = json.refresh_token ?? fallbackRefreshToken;
    if (!refreshToken) throw new Error('Spotify token response missing refresh_token.');
    return {
      accessToken: json.access_token,
      refreshToken,
      expiresAt: Date.now() + json.expires_in * 1000
    };
  }

  private waitForCallback(clientId: string, challenge: string, state: string): Promise<string> {
    this.closeServer();
    this.pending = true;

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        finish(() => reject(new Error('Login timed out. Please try again.')));
      }, 5 * 60_000);

      const finish = (settle: () => void): void => {
        clearTimeout(timeout);
        this.pending = false;
        this.closeServer();
        settle();
      };

      this.server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', REDIRECT_URI);
        if (url.pathname !== '/callback') {
          res.writeHead(404).end();
          return;
        }
        const error = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        const ok = !error && code && url.searchParams.get('state') === state;
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          ok
            ? '<body style="background:#121212;color:#1db954;font-family:sans-serif;text-align:center;padding-top:20vh"><h2>Connected to Spotify ✓</h2><p style="color:#aaa">You can close this tab and return to the MiniPlayer.</p></body>'
            : '<body style="background:#121212;color:#f55;font-family:sans-serif;text-align:center;padding-top:20vh"><h2>Login failed</h2><p>Please return to the MiniPlayer and try again.</p></body>'
        );
        if (ok) {
          finish(() => resolve(code));
        } else {
          finish(() => reject(new Error(error ?? 'Invalid OAuth callback.')));
        }
      });

      this.server.on('error', (err) => finish(() => reject(err)));
      this.server.listen(AUTH_PORT, '127.0.0.1', () => {
        const authUrl = new URL('https://accounts.spotify.com/authorize');
        authUrl.search = new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          scope: SCOPES.join(' '),
          redirect_uri: REDIRECT_URI,
          state,
          code_challenge_method: 'S256',
          code_challenge: challenge
        }).toString();
        void shell.openExternal(authUrl.toString());
      });
    });
  }

  private closeServer(): void {
    this.server?.close();
    this.server = null;
  }

  private setTokens(tokens: TokenSet): void {
    this.tokens = tokens;
    const json = JSON.stringify(tokens);
    if (safeStorage.isEncryptionAvailable()) {
      this.store.replace({ payload: safeStorage.encryptString(json).toString('base64'), encrypted: true });
    } else {
      this.store.replace({ payload: json, encrypted: false });
    }
  }

  private loadTokens(): TokenSet | null {
    const { payload, encrypted } = this.store.get();
    if (!payload) return null;
    try {
      const json = encrypted
        ? safeStorage.decryptString(Buffer.from(payload, 'base64'))
        : payload;
      return JSON.parse(json) as TokenSet;
    } catch (err) {
      // Keychain key changed or data is corrupt; clear it so we don't keep
      // failing on every launch and the next login can persist cleanly.
      console.warn('Stored Spotify tokens could not be decrypted; clearing them. Please reconnect.', err);
      this.store.replace({ payload: null, encrypted: false });
      return null;
    }
  }
}
