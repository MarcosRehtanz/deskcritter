const invoke = window.__TAURI__.core.invoke;

export const fileTools = {
  file_read: (args) => invoke('cu_file_read', args),
  file_write: (args) => invoke('cu_file_write', args),
  file_edit: (args) => invoke('cu_file_edit', args),
  file_list: (args) => invoke('cu_file_list', args),
};
