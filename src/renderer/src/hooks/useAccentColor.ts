import { useEffect, useState } from 'react';

const SPOTIFY_GREEN = '#1db954';

/**
 * Derives a vibrant accent color from the album artwork by sampling a
 * downscaled copy and averaging pixels weighted by saturation. Falls back
 * to Spotify green when the image cannot be read.
 */
export function useAccentColor(artworkUrl: string | null | undefined): string {
  const [accent, setAccent] = useState(SPOTIFY_GREEN);

  useEffect(() => {
    if (!artworkUrl) {
      setAccent(SPOTIFY_GREEN);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let r = 0;
        let g = 0;
        let b = 0;
        let weightSum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const [pr, pg, pb] = [data[i], data[i + 1], data[i + 2]];
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          const saturation = max === 0 ? 0 : (max - min) / max;
          const brightness = max / 255;
          // Favor colorful, reasonably bright pixels; ignore near-black/white.
          const weight = saturation * saturation * brightness + 0.001;
          r += pr * weight;
          g += pg * weight;
          b += pb * weight;
          weightSum += weight;
        }
        if (weightSum === 0) return;
        r = Math.round(r / weightSum);
        g = Math.round(g / weightSum);
        b = Math.round(b / weightSum);

        // Brighten dark accents so lyrics stay readable on the dark theme.
        const max = Math.max(r, g, b);
        if (max < 120 && max > 0) {
          const boost = 150 / max;
          r = Math.min(255, Math.round(r * boost));
          g = Math.min(255, Math.round(g * boost));
          b = Math.min(255, Math.round(b * boost));
        }
        setAccent(`rgb(${r}, ${g}, ${b})`);
      } catch {
        setAccent(SPOTIFY_GREEN); // canvas tainted (no CORS) or decode failure
      }
    };
    img.onerror = () => !cancelled && setAccent(SPOTIFY_GREEN);
    img.src = artworkUrl;
    return () => {
      cancelled = true;
    };
  }, [artworkUrl]);

  return accent;
}
