/** IPC channel names shared between main, preload and renderer. */
export const IPC = {
  // renderer -> main (invoke)
  AUTH_STATUS: 'auth:status',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  PLAYBACK_GET: 'playback:get',
  PLAYBACK_COMMAND: 'playback:command',
  LYRICS_GET: 'lyrics:get',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  WINDOW_SET_MODE: 'window:setMode',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_CLOSE: 'window:close',

  // main -> renderer (events)
  EVENT_PLAYBACK: 'event:playback',
  EVENT_LYRICS: 'event:lyrics',
  EVENT_AUTH: 'event:auth',
  EVENT_SETTINGS: 'event:settings',
  EVENT_FONT_SIZE_DELTA: 'event:fontSizeDelta'
} as const;
