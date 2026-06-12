import type { Settings, WindowMode } from '@shared/types';
import { CloseIcon, GearIcon, MinusIcon, PinIcon } from './Icons';

interface TitleBarProps {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  onOpenSettings: () => void;
}

const MODES: { mode: WindowMode; label: string }[] = [
  { mode: 'small', label: 'S' },
  { mode: 'compact', label: 'M' },
  { mode: 'expanded', label: 'L' }
];

/** Hover-revealed top bar: window mode switcher, pin, settings, hide, quit. */
export default function TitleBar({ settings, updateSettings, onOpenSettings }: TitleBarProps): JSX.Element {
  return (
    <div className="app-drag flex h-8 shrink-0 items-center justify-between px-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <div className="app-no-drag flex items-center gap-0.5 rounded-full bg-black/25 p-0.5">
        {MODES.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => void window.miniplayer.window.setMode(mode)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
              settings.windowMode === mode ? 'bg-white/90 text-black' : 'opacity-60 hover:opacity-100'
            }`}
            title={`${mode} mode`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="app-no-drag flex items-center gap-1">
        <button
          onClick={() => updateSettings({ alwaysOnTop: !settings.alwaysOnTop })}
          className={`rounded-full p-1.5 transition hover:bg-white/15 ${settings.alwaysOnTop ? 'text-[var(--accent)]' : 'opacity-60'}`}
          title="Toggle always on top"
        >
          <PinIcon size={13} filled={settings.alwaysOnTop} />
        </button>
        <button
          onClick={onOpenSettings}
          className="rounded-full p-1.5 opacity-60 transition hover:bg-white/15 hover:opacity-100"
          title="Settings"
        >
          <GearIcon size={13} />
        </button>
        <button
          onClick={() => void window.miniplayer.window.minimize()}
          className="rounded-full p-1.5 opacity-60 transition hover:bg-white/15 hover:opacity-100"
          title="Hide (Ctrl+Alt+P to restore)"
        >
          <MinusIcon size={13} />
        </button>
        <button
          onClick={() => void window.miniplayer.window.close()}
          className="rounded-full p-1.5 opacity-60 transition hover:bg-red-500/70 hover:opacity-100"
          title="Quit"
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  );
}
