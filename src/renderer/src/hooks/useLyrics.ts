import { useEffect, useState } from 'react';
import type { LyricsData } from '@shared/types';

export function useLyrics(trackId: string | undefined): { lyrics: LyricsData | null; loading: boolean } {
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return window.miniplayer.lyrics.onData((data) => {
      setLyrics(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!trackId) {
      setLyrics(null);
      return;
    }
    setLoading(true);
    void window.miniplayer.lyrics.get().then((data) => {
      if (data && data.trackId === trackId) {
        setLyrics(data);
        setLoading(false);
      }
    });
  }, [trackId]);

  const current = lyrics && lyrics.trackId === trackId ? lyrics : null;
  return { lyrics: current, loading: loading && !current };
}
