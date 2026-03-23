// Configuración del cliente — persistida en SQLite via db.js
// Cache en memoria para acceso síncrono después del init
import * as db from './db.js';
import { dbg } from './debug.js';

const DEFAULTS = {
  serverUrl: 'ws://localhost:3001',
  provider: '',
  agentKey: '',
  model: '',
  audioEnabled: false,
  audioLang: 'es-AR',
  // Whisper STT local
  whisperModel: 'Xenova/whisper-base',
  whisperLang: 'es',
  whisperPredownload: true,
  whisperLocal: true,
  // Sprite sheet custom (data URL o vacío para default)
  spriteSheet: '',
  // TTS (text-to-speech)
  ttsEnabled: true,
  ttsProvider: 'browser',  // 'browser' (Web Speech API) o 'server' (desde terminal-live)
  ttsVoice: '',            // nombre de voz del sistema (vacío = default)
  ttsRate: 1.0,            // 0.5 – 2.0
  ttsPitch: 1.0,           // 0.5 – 2.0
  ttsVolume: 1.0,          // 0.0 – 1.0
  // Burbuja de texto
  bubbleEnabled: true,
  // Nodriza (conexión P2P vía señalización)
  nodrizaUrl: 'ws://localhost:3000/signaling',
  nodrizaClientId: '',
  nodrizaApiKey: '',
  // Física
  physicsGravity: 1200,
  physicsWalkSpeed: 70,
  physicsBounceFactor: 0.25,
  physicsBounceThreshold: 150,
  physicsTerminalVelocity: 900,
  // Comportamiento — duraciones por estado (ms)
  behaviorCursorThreshold: 20,
  behaviorIdleMin: 2000,
  behaviorIdleMax: 5000,
  behaviorBlinkMin: 400,
  behaviorBlinkMax: 600,
  behaviorLookMin: 1000,
  behaviorLookMax: 2500,
  behaviorWalkMin: 2000,
  behaviorWalkMax: 5000,
  // Comportamiento — pesos de transición
  behaviorWeightBlink: 4,
  behaviorWeightLook: 2,
  behaviorWeightWalk: 1,
  // Comportamiento — frame rates (ms por frame)
  behaviorFpsIdle: 300,
  behaviorFpsBlink: 150,
  behaviorFpsLook: 250,
  behaviorFpsDrag: 200,
  // Apariencia
  spriteScale: 3,
  bubbleDismissMs: 12000,
  chatWidth: 320,
  chatHeight: 450,
  hoverDelayMs: 300,
  connBadgeEnabled: true,
  // Efectos de sonido
  sfxEnabled: true,
  sfxVolume: 0.5,
  sfxChat: true,
  sfxMessage: true,
  sfxMic: true,
  sfxConnect: true,
  sfxError: true,
  // Avanzado
  whisperIdleMs: 60000,
  whisperMaxRamMb: 2048,
  reconnectBaseMs: 1000,
  reconnectMaxMs: 30000,
  holdToTalkMs: 400,
  // Menú contextual
  contextMenuEnabled: true,
  // Emociones
  emotionsEnabled: true,
  emotionHappyMs: 2000,
  // Historial de chat
  chatHistoryEnabled: true,
  chatHistoryMax: 0,
  // Notificaciones del sistema
  notificationsEnabled: false,
  // API HTTP local
  localApiEnabled: false,
  localApiPort: 17842,
  // Auto-update
  autoUpdateEnabled: true,
  // Modo offline
  offlineQueueEnabled: true,
  offlineMaxRetries: 5,
  // Plugins
  pluginsEnabled: false,
  pluginsDir: 'plugins/',
};

let _cache = { ...DEFAULTS };
let _initialized = false;

// Carga toda la config de SQLite al cache. Inserta defaults si es primer arranque.
export async function init() {
  dbg('config', 'init()...');
  await db.init();
  const stored = await db.getAllConfig();
  dbg('config', 'config cargada de DB', stored);

  // Insertar defaults que no existan aún en la DB (batch)
  const missing = Object.entries(DEFAULTS).filter(([key]) => !(key in stored));
  if (missing.length > 0) {
    await Promise.all(missing.map(([key, value]) => db.setConfig(key, value)));
    for (const [key, value] of missing) stored[key] = value;
  }

  // Migración: limpiar provider (nodriza usa el del server)
  if (stored.provider === 'claude-code' || stored.provider === 'anthropic') {
    await db.setConfig('provider', '');
    stored.provider = '';
    dbg('config', 'migrado provider → vacío');
  }

  // Migración: whisper-small → whisper-base (más rápido, menos RAM)
  if (stored.whisperModel === 'Xenova/whisper-small') {
    await db.setConfig('whisperModel', 'Xenova/whisper-base');
    stored.whisperModel = 'Xenova/whisper-base';
    dbg('config', 'migrado whisperModel: small → base');
  }

  _cache = { ...DEFAULTS, ...stored };
  _initialized = true;
  dbg('config', 'config final', _cache);
}

// Acceso síncrono (usa cache, requiere init previo)
export function get(key) {
  return _cache[key];
}

export function getAll() {
  return { ..._cache };
}

// Guarda parcial en SQLite y actualiza cache
export async function set(partial) {
  for (const [key, value] of Object.entries(partial)) {
    _cache[key] = value;
    await db.setConfig(key, value);
  }
  return { ..._cache };
}

export async function reset() {
  await Promise.all(Object.entries(DEFAULTS).map(([key, value]) => db.setConfig(key, value)));
  _cache = { ...DEFAULTS };
  return { ..._cache };
}

export function getHttpUrl() {
  return get('serverUrl').replace(/^ws(s?):/, 'http$1:');
}
