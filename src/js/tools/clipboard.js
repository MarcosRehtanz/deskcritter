const invoke = window.__TAURI__.core.invoke;

export const clipboardTools = {
  clipboard_read: (args) => invoke('cu_clipboard_read'),
  clipboard_write: (args) => invoke('cu_clipboard_write', args),
};
