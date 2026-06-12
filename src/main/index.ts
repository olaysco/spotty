import { app, BrowserWindow, ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import {
  DEFAULT_SETTINGS,
  type AuthStatus,
  type PlaybackCommand,
  type Settings,
  type TrackInfo,
  type WindowMode
} from '@shared/types';
import { SpotifyAuth } from './auth';
import { LyricsService } from './lyrics';
import { registerShortcuts, unregisterShortcuts } from './shortcuts';
import { SpotifyService } from './spotify';
import { JsonStore } from './store';
import { createTray } from './tray';
import { PipWindow } from './window';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  void main();
}

async function main(): Promise<void> {
  const settingsStore = new JsonStore<Settings>('settings.json', DEFAULT_SETTINGS);
  const auth = new SpotifyAuth(() => settingsStore.get().spotifyClientId);
  const spotify = new SpotifyService(auth);
  const lyrics = new LyricsService();
  const pip = new PipWindow();

  let authError: string | null = null;
  let refreshTray: () => void = () => {};

  const send = (channel: string, payload: unknown): void => {
    pip.window?.webContents.send(channel, payload);
  };

  const authStatus = (): AuthStatus => ({
    authenticated: auth.authenticated,
    pending: auth.pending,
    error: authError
  });

  const updateSettings = (patch: Partial<Settings>): Settings => {
    const next = settingsStore.set(patch);
    pip.applySettings(next);
    if ('launchAtStartup' in patch) {
      app.setLoginItemSettings({ openAtLogin: next.launchAtStartup });
    }
    send(IPC.EVENT_SETTINGS, next);
    refreshTray();
    return next;
  };

  spotify.onState = (state) => send(IPC.EVENT_PLAYBACK, state);
  spotify.onTrackChange = (track: TrackInfo | null) => {
    if (!track) {
      send(IPC.EVENT_LYRICS, null);
      return;
    }
    void lyrics.getLyrics(track).then((data) => {
      // The track may have changed again while lyrics were loading.
      if (spotify.getState().track?.id === data.trackId) send(IPC.EVENT_LYRICS, data);
    });
  };

  ipcMain.handle(IPC.AUTH_STATUS, () => authStatus());
  ipcMain.handle(IPC.AUTH_LOGIN, async (_e, clientId?: string) => {
    if (clientId !== undefined) settingsStore.set({ spotifyClientId: clientId.trim() });
    authError = null;
    send(IPC.EVENT_AUTH, { ...authStatus(), pending: true });
    try {
      await auth.login();
      spotify.start();
    } catch (err) {
      authError = err instanceof Error ? err.message : String(err);
    }
    send(IPC.EVENT_AUTH, authStatus());
    return authStatus();
  });
  ipcMain.handle(IPC.AUTH_LOGOUT, () => {
    auth.logout();
    spotify.stop();
    send(IPC.EVENT_AUTH, authStatus());
    return authStatus();
  });

  ipcMain.handle(IPC.PLAYBACK_GET, () => spotify.getState());
  ipcMain.handle(IPC.PLAYBACK_COMMAND, (_e, cmd: PlaybackCommand) => spotify.command(cmd));
  ipcMain.handle(IPC.LYRICS_GET, async () => {
    const track = spotify.getState().track;
    return track ? lyrics.getLyrics(track) : null;
  });

  ipcMain.handle(IPC.SETTINGS_GET, () => settingsStore.get());
  ipcMain.handle(IPC.SETTINGS_SET, (_e, patch: Partial<Settings>) => updateSettings(patch));

  ipcMain.handle(IPC.WINDOW_SET_MODE, (_e, mode: WindowMode) => {
    updateSettings({ windowMode: mode });
    pip.setMode(mode);
  });
  ipcMain.handle(IPC.WINDOW_MINIMIZE, () => pip.window?.hide());
  ipcMain.handle(IPC.WINDOW_CLOSE, () => app.quit());

  await app.whenReady();
  app.setAppUserModelId('com.olaysco.spotify-miniplayer-pip');

  pip.create(settingsStore.get());
  ({ refresh: refreshTray } = createTray(pip, spotify, () => settingsStore.get(), (patch) => void updateSettings(patch)));
  registerShortcuts(spotify, pip);

  if (auth.authenticated) spotify.start();

  app.on('second-instance', () => {
    pip.window?.show();
    pip.window?.focus();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) pip.create(settingsStore.get());
    else pip.window?.show();
  });
  app.on('window-all-closed', () => {
    app.quit();
  });
  app.on('will-quit', () => {
    unregisterShortcuts();
    spotify.stop();
  });
}
