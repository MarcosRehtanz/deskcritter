const invoke = window.__TAURI__.core.invoke;

export const processTools = {
  process_list: (args) => invoke('cu_process_list', args),
  process_kill: (args) => invoke('cu_process_kill', args),
};
