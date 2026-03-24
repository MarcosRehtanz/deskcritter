const invoke = window.__TAURI__.core.invoke;

export const screenTools = {
  screenshot: (args) => invoke('cu_screenshot', args || {}),
  screen_info: (args) => invoke('cu_screen_info'),
};
