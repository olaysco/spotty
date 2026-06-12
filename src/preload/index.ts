import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC } from '@shared/ipc';
import type {
  AuthStatus,
  LyricsData,
  PlaybackCommand,
  PlaybackState,
  Settings,
  WindowMode
} from '@shared/types';

type Unsubscribe = () => void;

function on<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  auth: {
    status: (): Promise<AuthStatus> => ipcRenderer.invoke(IPC.AUTH_STATUS),
    login: (clientId?: string): Promise<AuthStatus> => ipcRenderer.invoke(IPC.AUTH_LOGIN, clientId),
    logout: (): Promise<AuthStatus> => ipcRenderer.invoke(IPC.AUTH_LOGOUT),
    onChange: (cb: (status: AuthStatus) => void): Unsubscribe => on(IPC.EVENT_AUTH, cb)
  },
  playback: {
    get: (): Promise<PlaybackState> => ipcRenderer.invoke(IPC.PLAYBACK_GET),
    command: (cmd: PlaybackCommand): Promise<void> => ipcRenderer.invoke(IPC.PLAYBACK_COMMAND, cmd),
    onState: (cb: (state: PlaybackState) => void): Unsubscribe => on(IPC.EVENT_PLAYBACK, cb)
  },
  lyrics: {
    get: (): Promise<LyricsData | null> => ipcRenderer.invoke(IPC.LYRICS_GET),
    onData: (cb: (data: LyricsData | null) => void): Unsubscribe => on(IPC.EVENT_LYRICS, cb)
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke(IPC.SETTINGS_SET, patch),
    onChange: (cb: (settings: Settings) => void): Unsubscribe => on(IPC.EVENT_SETTINGS, cb)
  },
  window: {
    setMode: (mode: WindowMode): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_SET_MODE, mode),
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_CLOSE)
  },
  onFontSizeDelta: (cb: (delta: number) => void): Unsubscribe => on(IPC.EVENT_FONT_SIZE_DELTA, cb)
};

export type MiniPlayerApi = typeof api;

contextBridge.exposeInMainWorld('miniplayer', api);
