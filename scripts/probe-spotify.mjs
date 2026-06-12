// Feasibility probe for the "score my singing on any song" feature.
//
// Determines whether YOUR Spotify app can access the data we'd need to
// derive a song's melody/pitch reference at runtime. Run it on your own
// machine (Spotify must be reachable). Quit the MiniPlayer first — this
// reuses the same loopback port (53682) and redirect URI.
//
//   node scripts/probe-spotify.mjs <CLIENT_ID> [TRACK_ID]
//
// If no TRACK_ID is given it uses whatever you're currently playing,
// falling back to a known public track. It prints a clear verdict on
// whether path "C" (Spotify Audio Analysis chroma) is viable for you.

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { exec } from 'node:child_process';

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = ['user-read-playback-state', 'user-read-currently-playing'];
const FALLBACK_TRACK = '3n3Ppam7vgaVa1iaRUc9Lp'; // Mr. Brightside — The Killers

const clientId = process.argv[2];
const trackArg = process.argv[3];
if (!clientId) {
  console.error('Usage: node scripts/probe-spotify.mjs <CLIENT_ID> [TRACK_ID]');
  process.exit(1);
}

const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.log(`\nOpen this URL manually:\n${url}\n`);
  });
}

function authorize() {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/callback') return res.writeHead(404).end();
      const code = url.searchParams.get('code');
      const ok = code && url.searchParams.get('state') === state;
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html' });
      res.end(ok ? '<h2>Done — return to your terminal.</h2>' : '<h2>Auth failed.</h2>');
      server.close();
      if (!ok) return reject(new Error('Authorization failed'));

      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: clientId,
          code_verifier: verifier
        })
      });
      if (!tokenRes.ok) return reject(new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`));
      resolve((await tokenRes.json()).access_token);
    });

    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
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
      console.log('Opening browser for Spotify login…');
      openBrowser(authUrl.toString());
    });
  });
}

async function get(token, path) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty / non-JSON */
  }
  return { status: res.status, body };
}

function verdict(label, status) {
  const sym = status === 200 ? '✅' : status === 403 || status === 404 ? '⛔' : '⚠️';
  console.log(`  ${sym} ${label}: HTTP ${status}`);
  return status === 200;
}

const token = await authorize();
console.log('\nAuthenticated. Probing endpoints…\n');

// Resolve a track id to test against.
let trackId = trackArg;
if (!trackId) {
  const np = await get(token, '/me/player/currently-playing');
  trackId = np.body?.item?.id ?? FALLBACK_TRACK;
  console.log(`Testing track: ${trackId}${np.body?.item?.name ? ` (${np.body.item.name})` : ' (fallback)'}\n`);
}

const analysis = await get(token, `/audio-analysis/${trackId}`);
const features = await get(token, `/audio-features/${trackId}`);

console.log('Endpoint availability:');
const analysisOk = verdict('Audio Analysis (chroma/pitch — what we need)', analysis.status);
verdict('Audio Features (key/tempo — nice to have)', features.status);

let hasPitches = false;
if (analysisOk) {
  const seg = analysis.body?.segments?.[0];
  hasPitches = Array.isArray(seg?.pitches) && seg.pitches.length === 12;
  console.log(
    `\n  Segments returned: ${analysis.body?.segments?.length ?? 0}` +
      `\n  Per-segment 12-bin pitch (chroma) vectors present: ${hasPitches ? 'yes' : 'no'}`
  );
}

console.log('\n──────── VERDICT ────────');
if (analysisOk && hasPitches) {
  console.log('✅ Path C is VIABLE for your app: Audio Analysis returns chroma.');
  console.log('   (Reminder: chroma is whole-mix, octave-agnostic — a coarse');
  console.log('    "in-key/in-chord" signal, not an isolated vocal melody.)');
} else if (analysis.status === 403 || analysis.status === 404) {
  console.log('⛔ Path C is BLOCKED: Audio Analysis is not available to this app');
  console.log('   (deprecated for apps created after Nov 2024). We would need to');
  console.log('   fall back to system-audio capture (path D) or a curated library (B).');
} else {
  console.log(`⚠️ Inconclusive (HTTP ${analysis.status}). Re-run, or check token scopes.`);
}
console.log('Please paste this whole output back so we can pick the design.');
process.exit(0);
