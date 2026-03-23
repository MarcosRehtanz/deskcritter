const invoke = window.__TAURI__.core.invoke;

export const gitTools = {
  git_status: (args) => invoke('cu_git_status', args),
  git_log: (args) => invoke('cu_git_log', args),
  git_diff: (args) => invoke('cu_git_diff', args),
};
