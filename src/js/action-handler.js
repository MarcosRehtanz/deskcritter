// Dispatcher central de acciones remotas (terminal-live → deskcritter)
// Recibe { type: "action", id, tool, args } y responde con action_result/action_error
import { eventBus } from './event-bus.js';
import { dbg } from './debug.js';
import { TOOL_MAP } from './tools/index.js';

let _sendFn = null;

export function init(sendFn) {
  _sendFn = sendFn;
  eventBus.on('action:request', handleAction);
}

async function handleAction({ id, tool, args }) {
  const executor = TOOL_MAP[tool];
  if (!executor) {
    _sendFn({ type: 'action_error', id, error: `Tool desconocido: ${tool}` });
    return;
  }
  try {
    dbg('action', `→ ${tool}`, args);
    const result = await executor(args || {});
    dbg('action', `← ${tool} OK`);
    _sendFn({ type: 'action_result', id, result });
  } catch (err) {
    dbg('action', `← ${tool} ERROR`, err);
    _sendFn({ type: 'action_error', id, error: String(err) });
  }
}
