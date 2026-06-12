import type { ReactNode } from 'react';
import type { LyricAlignment, LyricStyle, Settings, Theme } from '@shared/types';
import { CloseIcon } from './Icons';

interface SettingsPanelProps {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

export default function SettingsPanel({ settings, updateSettings, onClose }: SettingsPanelProps): JSX.Element {
  return (
    <div className="app-no-drag absolute inset-0 z-30 flex flex-col bg-black/85 backdrop-blur-xl">
      <div className="app-drag flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-bold">Settings</h2>
        <button onClick={onClose} className="app-no-drag rounded-full p-1.5 opacity-60 transition hover:bg-white/15 hover:opacity-100">
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="thin-scroll flex-1 space-y-4 overflow-y-auto px-4 pb-4 text-xs">
        <Section title="Window">
          <Toggle label="Always on top" value={settings.alwaysOnTop} onChange={(v) => updateSettings({ alwaysOnTop: v })} />
          <Toggle
            label="Click-through mode"
            hint="Mouse passes through the window. Restore via the tray icon."
            value={settings.clickThrough}
            onChange={(v) => updateSettings({ clickThrough: v })}
          />
          <Toggle label="Lock position" value={settings.lockPosition} onChange={(v) => updateSettings({ lockPosition: v })} />
          <Slider
            label="Window opacity"
            min={30}
            max={100}
            value={Math.round(settings.opacity * 100)}
            format={(v) => `${v}%`}
            onChange={(v) => updateSettings({ opacity: v / 100 })}
          />
          <Toggle label="Translucent background" value={settings.translucent} onChange={(v) => updateSettings({ translucent: v })} />
        </Section>

        <Section title="Lyrics">
          <Choice<LyricStyle>
            label="Display style"
            value={settings.lyricStyle}
            options={[
              { value: 'line', label: 'Line' },
              { value: 'karaoke', label: 'Karaoke' },
              { value: 'center', label: 'Focus' }
            ]}
            onChange={(v) => updateSettings({ lyricStyle: v })}
          />
          <Choice<LyricAlignment>
            label="Alignment"
            value={settings.lyricAlignment}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' }
            ]}
            onChange={(v) => updateSettings({ lyricAlignment: v })}
          />
          <Slider
            label="Font size"
            min={10}
            max={40}
            value={settings.fontSize}
            format={(v) => `${v}px`}
            onChange={(v) => updateSettings({ fontSize: v })}
          />
        </Section>

        <Section title="Appearance">
          <Choice<Theme>
            label="Theme"
            value={settings.theme}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' }
            ]}
            onChange={(v) => updateSettings({ theme: v })}
          />
          <Toggle label="Show album artwork" value={settings.showArtwork} onChange={(v) => updateSettings({ showArtwork: v })} />
          <Toggle label="Animations" value={settings.animations} onChange={(v) => updateSettings({ animations: v })} />
        </Section>

        <Section title="Startup">
          <Toggle label="Launch at login" value={settings.launchAtStartup} onChange={(v) => updateSettings({ launchAtStartup: v })} />
          <Toggle label="Start hidden" value={settings.startHidden} onChange={(v) => updateSettings({ startHidden: v })} />
        </Section>

        <Section title="Shortcuts">
          <ShortcutRow keys="Ctrl+Alt+Space" action="Play / Pause" />
          <ShortcutRow keys="Ctrl+Alt+← / →" action="Previous / Next track" />
          <ShortcutRow keys="Ctrl+Alt+P" action="Show / hide window" />
          <ShortcutRow keys="Ctrl+Alt+= / −" action="Lyric font size" />
        </Section>

        <Section title="Account">
          <button
            onClick={() => void window.miniplayer.auth.logout()}
            className="w-full rounded-lg border border-red-500/40 py-1.5 text-red-400 transition hover:bg-red-500/15"
          >
            Disconnect Spotify
          </button>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest opacity-40">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function ShortcutRow({ keys, action }: { keys: string; action: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="opacity-70">{action}</span>
      <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">{keys}</kbd>
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span>
        {label}
        {hint && <span className="block text-[10px] opacity-40">{hint}</span>}
      </span>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-4.5 w-8 shrink-0 rounded-full transition ${value ? 'bg-[var(--accent)]' : 'bg-white/20'}`}
        style={{ height: 18 }}
      >
        <span
          className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all"
          style={{ left: value ? 'calc(100% - 16px)' : 2 }}
        />
      </button>
    </label>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  format,
  onChange
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums opacity-50">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-[var(--accent)]"
      />
    </label>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <div className="flex gap-0.5 rounded-full bg-white/10 p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition ${
              value === opt.value ? 'bg-white/90 text-black' : 'opacity-60 hover:opacity-100'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
