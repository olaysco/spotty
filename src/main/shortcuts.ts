import { globalShortcut } from 'electron';
import { IPC } from '@shared/ipc';
import type { SpotifyService } from './spotify';
import type { PipWindow } from './window';

/**
 * Global keyboard shortcuts (work even when the PiP window is not focused):
 *   Ctrl/Cmd+Alt+Space  play/pause
 *   Ctrl/Cmd+Alt+Right  next track
 *   Ctrl/Cmd+Alt+Left   previous track
 *   Ctrl/Cmd+Alt+P      show/hide the PiP window
 *   Ctrl/Cmd+Alt+=      increase lyric font size
 *   Ctrl/Cmd+Alt+-      decrease lyric font size
 */
export function registerShortcuts(spotify: SpotifyService, pip: PipWindow): void {
  const bindings: Record<string, () => void> = {
    'CommandOrControl+Alt+Space': () => void spotify.togglePlayPause(),
    'CommandOrControl+Alt+Right': () => void spotify.command({ type: 'next' }),
    'CommandOrControl+Alt+Left': () => void spotify.command({ type: 'previous' }),
    'CommandOrControl+Alt+P': () => pip.toggleVisibility(),
    'CommandOrControl+Alt+=': () => pip.window?.webContents.send(IPC.EVENT_FONT_SIZE_DELTA, 2),
    'CommandOrControl+Alt+-': () => pip.window?.webContents.send(IPC.EVENT_FONT_SIZE_DELTA, -2)
  };
  for (const [accelerator, handler] of Object.entries(bindings)) {
    try {
      globalShortcut.register(accelerator, handler);
    } catch {
      // Another app may own the shortcut; not fatal.
    }
  }
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll();
}
