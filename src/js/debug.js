// Logger de debug — activado por env DESKCRITTER_DEBUG via Rust
// Logs van a consola + archivo debug.log
// Uso: import { dbg } from './debug.js';  dbg('modulo', 'mensaje', datos);

let _enabled = false;
let _buffer = [];
let _flushTimer = null;
const FLUSH_INTERVAL = 2000;
const _startTime = Date.now();

export async function initDebug() {
  try {
    _enabled = await window.__TAURI__.core.invoke('is_debug');
  } catch {
    _enabled = false;
  }
  if (_enabled) {
    let logPath = 'debug.log';
    try {
      logPath = await window.__TAURI__.core.invoke('get_log_path');
    } catch {}
    console.log(`%c[debug] modo debug activado — logs en ${logPath}`, 'color:#4caf50;font-weight:bold');
    window.addEventListener('beforeunload', _flush);
  }
}

function _timestamp() {
  const elapsed = Date.now() - _startTime;
  const s = (elapsed / 1000).toFixed(3);
  return `+${s}s`;
}

export function dbg(module, msg, data) {
  if (!_enabled) return;

  const ts = _timestamp();
  const line = data !== undefined
    ? `${ts} [${module}] ${msg} ${typeof data === 'object' ? JSON.stringify(data) : data}`
    : `${ts} [${module}] ${msg}`;

  // Consola
  if (data !== undefined) {
    console.log(`%c${ts} [${module}]%c ${msg}`, 'color:#888;font-weight:bold', 'color:inherit', data);
  } else {
    console.log(`%c${ts} [${module}]%c ${msg}`, 'color:#888;font-weight:bold', 'color:inherit');
  }

  // Buffer para archivo
  _buffer.push(line);
  _scheduleFlush();
}

function _scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    _flush();
  }, FLUSH_INTERVAL);
}

async function _flush() {
  if (_buffer.length === 0) return;
  const lines = _buffer.join('\n') + '\n';
  _buffer = [];
  try {
    await window.__TAURI__.core.invoke('write_log', { lines });
  } catch {}
}

export function isDebug() {
  return _enabled;
}

export function toggleDebug() {
  _enabled = !_enabled;
  if (!_enabled && _flushTimer) {
    clearTimeout(_flushTimer);
    _flush();
    _flushTimer = null;
  }
  return _enabled;
}
