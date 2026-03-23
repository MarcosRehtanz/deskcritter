const invoke = window.__TAURI__.core.invoke;

export const bashTools = {
  bash: (args) => invoke('cu_bash', args),
};
