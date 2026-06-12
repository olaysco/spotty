import { BrowserWindow, screen, shell } from 'electron';
import { join } from 'node:path';
import { MODE_SIZES, type Settings, type WindowMode } from '@shared/types';
import { JsonStore } from './store';

interface WindowState {
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
}

/**
 * Creates and manages the floating PiP window: frameless, transparent,
 * always-on-top, with persisted bounds and optional click-through.
 */
export class PipWindow {
  private win: BrowserWindow | null = null;
  private readonly bounds = new JsonStore<WindowState>('window-state.json', {
    x: null,
    y: null,
    width: null,
    height: null
  });
  private saveTimer: NodeJS.Timeout | null = null;

  create(settings: Settings): BrowserWindow {
    const mode = MODE_SIZES[settings.windowMode];
    const saved = this.bounds.get();

    this.win = new BrowserWindow({
      width: saved.width ?? mode.width,
      height: saved.height ?? mode.height,
      x: saved.x ?? undefined,
      y: saved.y ?? undefined,
      minWidth: mode.minWidth,
      minHeight: mode.minHeight,
      frame: false,
      transparent: true,
      // The native shadow follows the rectangular window frame, which shows
      // as a faint outline around the CSS-rounded content on macOS.
      hasShadow: false,
      resizable: true,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: false,
      show: false,
      backgroundColor: '#00000000',
      title: 'Spotify MiniPlayer',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    this.ensureOnScreen();
    this.applySettings(settings);
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    this.win.once('ready-to-show', () => {
      if (!settings.startHidden) this.win?.show();
    });

    const persistBounds = (): void => {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        if (!this.win || this.win.isDestroyed()) return;
        const b = this.win.getBounds();
        this.bounds.set({ x: b.x, y: b.y, width: b.width, height: b.height });
      }, 400);
    };
    this.win.on('moved', persistBounds);
    this.win.on('resized', persistBounds);
    this.win.on('closed', () => {
      this.win = null;
    });

    // Open any external links in the system browser, never in the PiP window.
    this.win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: 'deny' };
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      void this.win.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      void this.win.loadFile(join(__dirname, '../renderer/index.html'));
    }

    return this.win;
  }

  get window(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  applySettings(settings: Settings): void {
    const win = this.window;
    if (!win) return;
    win.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver');
    win.setOpacity(Math.min(1, Math.max(0.3, settings.opacity)));
    win.setIgnoreMouseEvents(settings.clickThrough, { forward: true });
    win.setMovable(!settings.lockPosition);
    const mode = MODE_SIZES[settings.windowMode];
    win.setMinimumSize(mode.minWidth, mode.minHeight);
  }

  setMode(mode: WindowMode): void {
    const win = this.window;
    if (!win) return;
    const size = MODE_SIZES[mode];
    win.setMinimumSize(size.minWidth, size.minHeight);
    win.setSize(size.width, size.height, true);
    this.ensureOnScreen();
  }

  toggleVisibility(): void {
    const win = this.window;
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
    }
  }

  /** Moves the window back into view if its saved position is off-screen. */
  private ensureOnScreen(): void {
    const win = this.window;
    if (!win) return;
    const b = win.getBounds();
    const onSomeDisplay = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return b.x < a.x + a.width - 40 && b.x + b.width > a.x + 40 && b.y >= a.y - 10 && b.y < a.y + a.height - 40;
    });
    if (!onSomeDisplay) {
      const { workArea } = screen.getPrimaryDisplay();
      win.setPosition(workArea.x + workArea.width - b.width - 24, workArea.y + 24);
    }
  }
}
