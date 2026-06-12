import type { MiniPlayerApi } from './index';

declare global {
  interface Window {
    miniplayer: MiniPlayerApi;
  }
}

export {};
