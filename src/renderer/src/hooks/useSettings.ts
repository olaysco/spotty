import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '@shared/types';

export function useSettings(): {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
} {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    void window.miniplayer.settings.get().then(setSettings);
    const unsubscribe = window.miniplayer.settings.onChange(setSettings);
    const unsubscribeFont = window.miniplayer.onFontSizeDelta((delta) => {
      void window.miniplayer.settings.get().then((current) => {
        const fontSize = Math.min(40, Math.max(10, current.fontSize + delta));
        void window.miniplayer.settings.set({ fontSize });
      });
    });
    return () => {
      unsubscribe();
      unsubscribeFont();
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch })); // optimistic
    void window.miniplayer.settings.set(patch);
  }, []);

  return { settings, update };
}
