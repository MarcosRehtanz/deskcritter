const invoke = window.__TAURI__.core.invoke;

export const grepTools = {
  grep: (args) => invoke('cu_grep', { ...args, globFilter: args.glob_filter, maxResults: args.max_results }),
};
