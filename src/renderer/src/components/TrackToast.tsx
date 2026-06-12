import { useEffect, useRef, useState } from 'react';
import type { TrackInfo } from '@shared/types';

/** Brief popup shown when a new track starts playing. */
export default function TrackToast({ track }: { track: TrackInfo | null }): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState<TrackInfo | null>(null);
  const previousId = useRef<string | null>(null);
  const isFirst = useRef(true);

  useEffect(() => {
    const id = track?.id ?? null;
    if (id === previousId.current) return;
    previousId.current = id;
    if (isFirst.current) {
      // Don't toast the track that was already playing at startup.
      isFirst.current = false;
      return;
    }
    if (!track) return;
    setShown(track);
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3200);
    return () => clearTimeout(timer);
  }, [track]);

  if (!shown) return null;
  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-9 z-20 flex max-w-[85%] -translate-x-1/2 items-center gap-2.5 rounded-xl bg-black/75 px-3 py-2 shadow-xl backdrop-blur-md transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      {shown.artworkUrl && <img src={shown.artworkUrl} alt="" className="h-9 w-9 rounded-md" />}
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-white">{shown.title}</p>
        <p className="truncate text-[10px] text-white/60">{shown.artists.join(', ')}</p>
      </div>
    </div>
  );
}
