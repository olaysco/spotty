import { app, Menu, nativeImage, Tray } from 'electron';
import icon from '../../resources/icon.png?asset';
import type { Settings } from '@shared/types';
import type { SpotifyService } from './spotify';
import type { PipWindow } from './window';

/**
 * System tray icon. Essential as the recovery path when click-through mode
 * is enabled and the window itself no longer receives mouse events.
 */
export function createTray(
  pip: PipWindow,
  spotify: SpotifyService,
  getSettings: () => Settings,
  updateSettings: (patch: Partial<Settings>) => void
): { tray: Tray; refresh: () => void } {
  const image = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 });
  const tray = new Tray(image);
  tray.setToolTip('Spotify MiniPlayer PiP');

  const rebuildMenu = (): void => {
    const settings = getSettings();
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show / Hide MiniPlayer', click: () => pip.toggleVisibility() },
        { type: 'separator' },
        { label: 'Play / Pause', click: () => void spotify.togglePlayPause() },
        { label: 'Next Track', click: () => void spotify.command({ type: 'next' }) },
        { label: 'Previous Track', click: () => void spotify.command({ type: 'previous' }) },
        { type: 'separator' },
        {
          label: 'Always on Top',
          type: 'checkbox',
          checked: settings.alwaysOnTop,
          click: (item) => updateSettings({ alwaysOnTop: item.checked })
        },
        {
          label: 'Click-Through Mode',
          type: 'checkbox',
          checked: settings.clickThrough,
          click: (item) => updateSettings({ clickThrough: item.checked })
        },
        {
          label: 'Lock Position',
          type: 'checkbox',
          checked: settings.lockPosition,
          click: (item) => updateSettings({ lockPosition: item.checked })
        },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
      ])
    );
  };

  rebuildMenu();
  tray.on('click', () => pip.toggleVisibility());
  return { tray, refresh: rebuildMenu };
}
