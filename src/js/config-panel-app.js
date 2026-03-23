// Lógica del panel de configuración (corre dentro de la ventana secundaria)
// Usa SQLite via window.__DESKCRITTER_DB__ (expuesto por db.js)

const DEFAULTS = {
  serverUrl: 'ws://localhost:3001',
  provider: '',
  agentKey: '',
  model: '',
  audioEnabled: false,
  audioLang: 'es-AR',
  whisperModel: 'Xenova/whisper-base',
  whisperLang: 'es',
  whisperPredownload: true,
  spriteSheet: '',
  whisperLocal: true,
  ttsEnabled: true,
  ttsProvider: 'browser',
  ttsVoice: '',
  ttsRate: 1.0,
  ttsPitch: 1.0,
  ttsVolume: 1.0,
  bubbleEnabled: true,
  nodrizaUrl: 'ws://localhost:3000/signaling',
  nodrizaClientId: '',
  nodrizaApiKey: '',
  // Física
  physicsGravity: 1200,
  physicsWalkSpeed: 70,
  physicsBounceFactor: 0.25,
  physicsBounceThreshold: 150,
  physicsTerminalVelocity: 900,
  // Comportamiento — duraciones
  behaviorCursorThreshold: 20,
  behaviorIdleMin: 2000,
  behaviorIdleMax: 5000,
  behaviorBlinkMin: 400,
  behaviorBlinkMax: 600,
  behaviorLookMin: 1000,
  behaviorLookMax: 2500,
  behaviorWalkMin: 2000,
  behaviorWalkMax: 5000,
  // Comportamiento — pesos
  behaviorWeightBlink: 4,
  behaviorWeightLook: 2,
  behaviorWeightWalk: 1,
  // Comportamiento — frame rates
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
  // Atajos globales (letra para Ctrl+Shift+<letra>)
  hotkeyChat: 'M',
  hotkeyVisibility: 'H',
  hotkeyConfig: 'C',
  hotkeyDebug: 'D',
  hotkeyReconnect: 'R',
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

let db = null;

// --- Esperar a que db.js exponga el singleton ---

async function waitForDb() {
  // db.js se carga como módulo antes que este archivo, pero puede tardar
  for (let i = 0; i < 50; i++) {
    if (window.__DESKCRITTER_DB__) return window.__DESKCRITTER_DB__;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('DB no disponible');
}

// --- Leer config desde SQLite ---

async function loadConfig() {
  const stored = await db.getAllConfig();
  return { ...DEFAULTS, ...stored };
}

// --- Guardar un valor de config ---

async function saveConfigKey(key, value) {
  await db.setConfig(key, value);
}

// --- Sincronizar config → inputs ---

// Helper: setear valor de un input numérico
function syncNum(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

// Helper: setear valor de un range slider y actualizar su label
function syncRange(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  const label = document.getElementById(id + '-val');
  if (label) label.textContent = value;
}

async function sync() {
  const c = await loadConfig();
  document.getElementById('cp-server-url').value = c.serverUrl || '';
  document.getElementById('cp-provider').value = c.provider || '';
  document.getElementById('cp-agent-key').value = c.agentKey || '';
  document.getElementById('cp-model').value = c.model || '';
  document.getElementById('cp-audio-enabled').checked = !!c.audioEnabled;
  document.getElementById('cp-whisper-model').value = c.whisperModel || 'Xenova/whisper-small';
  document.getElementById('cp-whisper-lang').value = c.whisperLang || 'es';
  document.getElementById('cp-audio-lang').value = c.audioLang || 'es-AR';
  document.getElementById('cp-whisper-local').checked = c.whisperLocal !== false;
  // Burbuja
  document.getElementById('cp-bubble-enabled').checked = c.bubbleEnabled !== false;
  // TTS
  document.getElementById('cp-tts-enabled').checked = c.ttsEnabled !== false;
  document.getElementById('cp-tts-provider').value = c.ttsProvider || 'browser';
  populateVoices(c.ttsVoice);
  // TTS sliders
  syncRange('cp-tts-rate', c.ttsRate ?? 1);
  syncRange('cp-tts-pitch', c.ttsPitch ?? 1);
  syncRange('cp-tts-volume', c.ttsVolume ?? 1);
  // Modo offline
  const offlineQueueEl = document.getElementById('cp-offline-queue-enabled');
  if (offlineQueueEl) offlineQueueEl.checked = c.offlineQueueEnabled !== false;
  syncNum('cp-offline-max-retries', c.offlineMaxRetries);
  // Indicador de conexión
  const connBadgeEl = document.getElementById('cp-conn-badge-enabled');
  if (connBadgeEl) connBadgeEl.checked = c.connBadgeEnabled !== false;
  // Nodriza
  document.getElementById('cp-nodriza-url').value = c.nodrizaUrl || 'ws://localhost:3000/signaling';
  document.getElementById('cp-nodriza-client-id').value = c.nodrizaClientId || '';
  document.getElementById('cp-nodriza-api-key').value = c.nodrizaApiKey || '';
  // Física
  syncNum('cp-physics-gravity', c.physicsGravity);
  syncNum('cp-physics-walk-speed', c.physicsWalkSpeed);
  syncNum('cp-physics-bounce-factor', c.physicsBounceFactor);
  syncNum('cp-physics-bounce-threshold', c.physicsBounceThreshold);
  syncNum('cp-physics-terminal-velocity', c.physicsTerminalVelocity);
  // Comportamiento
  syncNum('cp-behavior-cursor-threshold', c.behaviorCursorThreshold);
  syncNum('cp-behavior-idle-min', c.behaviorIdleMin);
  syncNum('cp-behavior-idle-max', c.behaviorIdleMax);
  syncNum('cp-behavior-blink-min', c.behaviorBlinkMin);
  syncNum('cp-behavior-blink-max', c.behaviorBlinkMax);
  syncNum('cp-behavior-look-min', c.behaviorLookMin);
  syncNum('cp-behavior-look-max', c.behaviorLookMax);
  syncNum('cp-behavior-walk-min', c.behaviorWalkMin);
  syncNum('cp-behavior-walk-max', c.behaviorWalkMax);
  syncNum('cp-behavior-weight-blink', c.behaviorWeightBlink);
  syncNum('cp-behavior-weight-look', c.behaviorWeightLook);
  syncNum('cp-behavior-weight-walk', c.behaviorWeightWalk);
  syncNum('cp-behavior-fps-idle', c.behaviorFpsIdle);
  syncNum('cp-behavior-fps-blink', c.behaviorFpsBlink);
  syncNum('cp-behavior-fps-look', c.behaviorFpsLook);
  syncNum('cp-behavior-fps-drag', c.behaviorFpsDrag);
  // Emociones
  const emotionsEl = document.getElementById('cp-emotions-enabled');
  if (emotionsEl) emotionsEl.checked = c.emotionsEnabled !== false;
  syncNum('cp-emotion-happy-ms', c.emotionHappyMs);
  // Historial de chat
  const chatHistEl = document.getElementById('cp-chat-history-enabled');
  if (chatHistEl) chatHistEl.checked = c.chatHistoryEnabled !== false;
  syncNum('cp-chat-history-max', c.chatHistoryMax);
  // Apariencia
  syncNum('cp-sprite-scale', c.spriteScale);
  syncNum('cp-bubble-dismiss-ms', c.bubbleDismissMs);
  syncNum('cp-chat-width', c.chatWidth);
  syncNum('cp-chat-height', c.chatHeight);
  syncNum('cp-hover-delay-ms', c.hoverDelayMs);
  // Avanzado
  syncNum('cp-whisper-idle-ms', c.whisperIdleMs);
  syncNum('cp-whisper-max-ram-mb', c.whisperMaxRamMb);
  syncNum('cp-reconnect-base-ms', c.reconnectBaseMs);
  syncNum('cp-reconnect-max-ms', c.reconnectMaxMs);
  syncNum('cp-hold-to-talk-ms', c.holdToTalkMs);
  // Notificaciones
  const notifEl = document.getElementById('cp-notifications-enabled');
  if (notifEl) notifEl.checked = !!c.notificationsEnabled;
  // Auto-update
  const autoUpdateEl = document.getElementById('cp-auto-update-enabled');
  if (autoUpdateEl) autoUpdateEl.checked = c.autoUpdateEnabled !== false;
  // Menú contextual
  const ctxMenuEl = document.getElementById('cp-context-menu-enabled');
  if (ctxMenuEl) ctxMenuEl.checked = c.contextMenuEnabled !== false;
  // Sonidos
  const sfxEnabledEl = document.getElementById('cp-sfx-enabled');
  if (sfxEnabledEl) sfxEnabledEl.checked = c.sfxEnabled !== false;
  const sfxVolumeEl = document.getElementById('cp-sfx-volume');
  if (sfxVolumeEl) {
    sfxVolumeEl.value = c.sfxVolume ?? 0.5;
    const sfxVolLabel = document.getElementById('cp-sfx-volume-val');
    if (sfxVolLabel) sfxVolLabel.textContent = c.sfxVolume ?? 0.5;
  }
  const sfxKeys = ['sfxChat', 'sfxMessage', 'sfxMic', 'sfxConnect', 'sfxError'];
  for (const key of sfxKeys) {
    const el = document.getElementById('cp-' + key.replace(/([A-Z])/g, '-$1').toLowerCase());
    if (el) el.checked = c[key] !== false;
  }
  // API
  const apiEnabledEl = document.getElementById('cp-local-api-enabled');
  if (apiEnabledEl) apiEnabledEl.checked = !!c.localApiEnabled;
  syncNum('cp-local-api-port', c.localApiPort);
  // Plugins
  const pluginsEl = document.getElementById('cp-plugins-enabled');
  if (pluginsEl) pluginsEl.checked = !!c.pluginsEnabled;
  const pluginsDirEl = document.getElementById('cp-plugins-dir');
  if (pluginsDirEl) pluginsDirEl.value = c.pluginsDir || 'plugins/';
  // Atajos
  document.getElementById('cp-hotkey-chat').value = (c.hotkeyChat || 'M').toUpperCase();
  document.getElementById('cp-hotkey-visibility').value = (c.hotkeyVisibility || 'H').toUpperCase();
  document.getElementById('cp-hotkey-config').value = (c.hotkeyConfig || 'C').toUpperCase();
  document.getElementById('cp-hotkey-debug').value = (c.hotkeyDebug || 'D').toUpperCase();
  document.getElementById('cp-hotkey-reconnect').value = (c.hotkeyReconnect || 'R').toUpperCase();
}

// --- Leer inputs → guardar config ---

// Helper: leer valor numérico de un input, con fallback al default
function readNum(id, key) {
  const el = document.getElementById(id);
  if (!el) return DEFAULTS[key];
  const v = parseFloat(el.value);
  return isNaN(v) ? DEFAULTS[key] : v;
}

// Helper: leer valor de hotkey (una sola letra A-Z)
function readHotkey(id, fallback) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const v = el.value.trim().toUpperCase();
  return /^[A-Z]$/.test(v) ? v : fallback;
}

// Validar que no haya letras duplicadas en atajos
function validateHotkeys(pairs) {
  const keys = [
    pairs.hotkeyChat, pairs.hotkeyVisibility, pairs.hotkeyConfig,
    pairs.hotkeyDebug, pairs.hotkeyReconnect,
  ];
  const seen = new Set();
  for (const k of keys) {
    if (seen.has(k)) return `La letra "${k}" está duplicada`;
    seen.add(k);
  }
  return null;
}

async function save() {
  const pairs = {
    serverUrl: document.getElementById('cp-server-url').value.trim(),
    provider: document.getElementById('cp-provider').value.trim(),
    agentKey: document.getElementById('cp-agent-key').value.trim(),
    model: document.getElementById('cp-model').value.trim(),
    audioEnabled: document.getElementById('cp-audio-enabled').checked,
    whisperModel: document.getElementById('cp-whisper-model').value,
    whisperLang: document.getElementById('cp-whisper-lang').value.trim(),
    audioLang: document.getElementById('cp-audio-lang').value.trim(),
    whisperLocal: document.getElementById('cp-whisper-local').checked,
    // Burbuja
    bubbleEnabled: document.getElementById('cp-bubble-enabled').checked,
    // TTS
    ttsEnabled: document.getElementById('cp-tts-enabled').checked,
    ttsProvider: document.getElementById('cp-tts-provider').value,
    ttsVoice: document.getElementById('cp-tts-voice').value,
    ttsRate: parseFloat(document.getElementById('cp-tts-rate').value) || 1,
    ttsPitch: parseFloat(document.getElementById('cp-tts-pitch').value) || 1,
    ttsVolume: parseFloat(document.getElementById('cp-tts-volume').value) || 1,
    connBadgeEnabled: document.getElementById('cp-conn-badge-enabled')?.checked ?? true,
    offlineQueueEnabled: document.getElementById('cp-offline-queue-enabled')?.checked ?? true,
    offlineMaxRetries: readNum('cp-offline-max-retries', 'offlineMaxRetries'),
    // Nodriza
    nodrizaUrl: document.getElementById('cp-nodriza-url').value.trim(),
    nodrizaClientId: document.getElementById('cp-nodriza-client-id').value.trim(),
    nodrizaApiKey: document.getElementById('cp-nodriza-api-key').value.trim(),
    // Física
    physicsGravity: readNum('cp-physics-gravity', 'physicsGravity'),
    physicsWalkSpeed: readNum('cp-physics-walk-speed', 'physicsWalkSpeed'),
    physicsBounceFactor: readNum('cp-physics-bounce-factor', 'physicsBounceFactor'),
    physicsBounceThreshold: readNum('cp-physics-bounce-threshold', 'physicsBounceThreshold'),
    physicsTerminalVelocity: readNum('cp-physics-terminal-velocity', 'physicsTerminalVelocity'),
    // Comportamiento
    behaviorCursorThreshold: readNum('cp-behavior-cursor-threshold', 'behaviorCursorThreshold'),
    behaviorIdleMin: readNum('cp-behavior-idle-min', 'behaviorIdleMin'),
    behaviorIdleMax: readNum('cp-behavior-idle-max', 'behaviorIdleMax'),
    behaviorBlinkMin: readNum('cp-behavior-blink-min', 'behaviorBlinkMin'),
    behaviorBlinkMax: readNum('cp-behavior-blink-max', 'behaviorBlinkMax'),
    behaviorLookMin: readNum('cp-behavior-look-min', 'behaviorLookMin'),
    behaviorLookMax: readNum('cp-behavior-look-max', 'behaviorLookMax'),
    behaviorWalkMin: readNum('cp-behavior-walk-min', 'behaviorWalkMin'),
    behaviorWalkMax: readNum('cp-behavior-walk-max', 'behaviorWalkMax'),
    behaviorWeightBlink: readNum('cp-behavior-weight-blink', 'behaviorWeightBlink'),
    behaviorWeightLook: readNum('cp-behavior-weight-look', 'behaviorWeightLook'),
    behaviorWeightWalk: readNum('cp-behavior-weight-walk', 'behaviorWeightWalk'),
    behaviorFpsIdle: readNum('cp-behavior-fps-idle', 'behaviorFpsIdle'),
    behaviorFpsBlink: readNum('cp-behavior-fps-blink', 'behaviorFpsBlink'),
    behaviorFpsLook: readNum('cp-behavior-fps-look', 'behaviorFpsLook'),
    behaviorFpsDrag: readNum('cp-behavior-fps-drag', 'behaviorFpsDrag'),
    // Emociones
    emotionsEnabled: document.getElementById('cp-emotions-enabled')?.checked ?? true,
    emotionHappyMs: readNum('cp-emotion-happy-ms', 'emotionHappyMs'),
    // Historial de chat
    chatHistoryEnabled: document.getElementById('cp-chat-history-enabled')?.checked ?? true,
    chatHistoryMax: readNum('cp-chat-history-max', 'chatHistoryMax'),
    // Apariencia
    spriteScale: readNum('cp-sprite-scale', 'spriteScale'),
    bubbleDismissMs: readNum('cp-bubble-dismiss-ms', 'bubbleDismissMs'),
    chatWidth: readNum('cp-chat-width', 'chatWidth'),
    chatHeight: readNum('cp-chat-height', 'chatHeight'),
    hoverDelayMs: readNum('cp-hover-delay-ms', 'hoverDelayMs'),
    // Avanzado
    whisperIdleMs: readNum('cp-whisper-idle-ms', 'whisperIdleMs'),
    whisperMaxRamMb: readNum('cp-whisper-max-ram-mb', 'whisperMaxRamMb'),
    reconnectBaseMs: readNum('cp-reconnect-base-ms', 'reconnectBaseMs'),
    reconnectMaxMs: readNum('cp-reconnect-max-ms', 'reconnectMaxMs'),
    holdToTalkMs: readNum('cp-hold-to-talk-ms', 'holdToTalkMs'),
    notificationsEnabled: document.getElementById('cp-notifications-enabled')?.checked ?? false,
    autoUpdateEnabled: document.getElementById('cp-auto-update-enabled')?.checked ?? true,
    contextMenuEnabled: document.getElementById('cp-context-menu-enabled')?.checked ?? true,
    // Sonidos
    sfxEnabled: document.getElementById('cp-sfx-enabled')?.checked ?? true,
    sfxVolume: parseFloat(document.getElementById('cp-sfx-volume')?.value) || 0.5,
    sfxChat: document.getElementById('cp-sfx-chat')?.checked ?? true,
    sfxMessage: document.getElementById('cp-sfx-message')?.checked ?? true,
    sfxMic: document.getElementById('cp-sfx-mic')?.checked ?? true,
    sfxConnect: document.getElementById('cp-sfx-connect')?.checked ?? true,
    sfxError: document.getElementById('cp-sfx-error')?.checked ?? true,
    // API
    localApiEnabled: document.getElementById('cp-local-api-enabled')?.checked ?? false,
    localApiPort: readNum('cp-local-api-port', 'localApiPort'),
    // Plugins
    pluginsEnabled: document.getElementById('cp-plugins-enabled')?.checked ?? false,
    pluginsDir: document.getElementById('cp-plugins-dir')?.value?.trim() || 'plugins/',
    // Atajos
    hotkeyChat: readHotkey('cp-hotkey-chat', 'M'),
    hotkeyVisibility: readHotkey('cp-hotkey-visibility', 'H'),
    hotkeyConfig: readHotkey('cp-hotkey-config', 'C'),
    hotkeyDebug: readHotkey('cp-hotkey-debug', 'D'),
    hotkeyReconnect: readHotkey('cp-hotkey-reconnect', 'R'),
  };
  // Validar hotkeys antes de guardar
  const hotkeyErr = validateHotkeys(pairs);
  const errorEl = document.getElementById('cp-hotkey-error');
  if (hotkeyErr) {
    if (errorEl) errorEl.textContent = hotkeyErr;
    return;
  }
  if (errorEl) errorEl.textContent = '';

  for (const [key, value] of Object.entries(pairs)) {
    await saveConfigKey(key, value);
  }
  // Emitir evento para que la ventana principal re-lea la config
  emitToMain('config:changed', pairs);
}

// Restaurar defaults de una sección y re-sincronizar
async function resetSection(keys) {
  for (const key of keys) {
    if (key in DEFAULTS) {
      await saveConfigKey(key, DEFAULTS[key]);
    }
  }
  await sync();
  // Notificar a la ventana principal
  const partial = {};
  for (const key of keys) {
    if (key in DEFAULTS) partial[key] = DEFAULTS[key];
  }
  emitToMain('config:changed', partial);
}


// --- Emitir evento a la ventana principal ---

async function emitToMain(eventName, payload) {
  try {
    const { emit } = window.__TAURI__.event;
    await emit(eventName, payload);
  } catch (e) {
    console.warn('[config-panel] no se pudo emitir evento:', e);
  }
}

// --- Cerrar esta ventana ---

async function closeWindow() {
  try {
    const win = window.__TAURI__.window.getCurrentWindow();
    await win.close();
  } catch {
    window.close();
  }
}

// --- Escuchar estado de conexión desde la ventana principal ---

async function listenEvents() {
  try {
    const { listen } = window.__TAURI__.event;
    const dot = document.getElementById('cp-conn-status');

    await listen('config:server-status', (event) => {
      const connected = event.payload?.connected;
      dot.textContent = connected ? 'conectado' : 'desconectado';
      dot.className = 'cp-status ' + (connected ? 'connected' : 'disconnected');
    });
  } catch {}
}

// --- Navegación del menú lateral ---

function initNav() {
  const buttons = document.querySelectorAll('.cp-sidebar button[data-page]');
  const pages = document.querySelectorAll('.cp-page');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.page;
      buttons.forEach(b => b.classList.remove('active'));
      pages.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const page = document.getElementById('page-' + target);
      if (page) page.classList.add('active');
    });
  });
}

// =============================================
// Gestión de personajes
// =============================================

const SPRITE_FRAME_SIZE = 32;
const SPRITE_MIN_COLS = 4;
const SPRITE_MIN_ROWS = 5;

function validateSpriteSheet(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  if (w % SPRITE_FRAME_SIZE !== 0 || h % SPRITE_FRAME_SIZE !== 0) {
    return `Dimensiones ${w}×${h} no son múltiplo de ${SPRITE_FRAME_SIZE}`;
  }
  const cols = w / SPRITE_FRAME_SIZE;
  const rows = h / SPRITE_FRAME_SIZE;
  if (cols < SPRITE_MIN_COLS) {
    return `Necesita mínimo ${SPRITE_MIN_COLS} columnas (tiene ${cols})`;
  }
  if (rows < SPRITE_MIN_ROWS) {
    return `Necesita mínimo ${SPRITE_MIN_ROWS} filas (tiene ${rows})`;
  }
  return null;
}

function showSpritePreview(src) {
  const preview = document.getElementById('cp-sprite-preview');
  preview.innerHTML = '';
  if (!src) {
    preview.textContent = 'default';
    return;
  }
  const img = document.createElement('img');
  img.src = src;
  preview.appendChild(img);
}

// Renderizar la lista de personajes desde DB
async function renderCharacters() {
  const list = document.getElementById('cp-char-list');
  const characters = await db.getCharacters();
  list.innerHTML = '';

  if (characters.length === 0) {
    list.innerHTML = '<li style="color:#666;font-size:11px;padding:8px;">Sin personajes guardados</li>';
    showSpritePreview('');
    return;
  }

  let activeSprite = '';

  for (const char of characters) {
    const li = document.createElement('li');
    li.className = 'cp-char-item' + (char.is_active ? ' active' : '');

    // Miniatura: primer frame 32x32 del sprite sheet
    const thumb = document.createElement('img');
    thumb.className = 'cp-char-thumb';
    thumb.src = char.sprite;
    li.appendChild(thumb);

    const name = document.createElement('span');
    name.className = 'cp-char-name';
    name.textContent = char.name + (char.is_active ? ' ✓' : '');
    li.appendChild(name);

    const actions = document.createElement('div');
    actions.className = 'cp-char-actions';

    if (!char.is_active) {
      const activateBtn = document.createElement('button');
      activateBtn.className = 'active-btn';
      activateBtn.textContent = 'Activar';
      activateBtn.addEventListener('click', async () => {
        await db.setActiveCharacter(char.id);
        await renderCharacters();
        // Notificar a la ventana principal
        const active = await db.getActiveCharacter();
        emitToMain('config:sprite-changed', { spriteSheet: active?.sprite || '' });
      });
      actions.appendChild(activateBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Eliminar';
    deleteBtn.addEventListener('click', async () => {
      const wasActive = char.is_active;
      await db.deleteCharacter(char.id);
      await renderCharacters();
      if (wasActive) {
        emitToMain('config:sprite-changed', { spriteSheet: '' });
      }
    });
    actions.appendChild(deleteBtn);

    li.appendChild(actions);
    list.appendChild(li);

    if (char.is_active) {
      activeSprite = char.sprite;
    }
  }

  showSpritePreview(activeSprite);
}

function initCharacters() {
  const fileInput = document.getElementById('cp-new-char-file');
  const fileBtn = document.getElementById('cp-new-char-file-btn');
  const nameInput = document.getElementById('cp-new-char-name');
  const resetBtn = document.getElementById('cp-sprite-reset');
  const error = document.getElementById('cp-sprite-error');

  fileBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;

    const charName = nameInput.value.trim();
    if (!charName) {
      error.textContent = 'Ingresá un nombre para el personaje';
      fileInput.value = '';
      return;
    }

    error.textContent = '';

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;

      const img = new Image();
      img.onload = async () => {
        const err = validateSpriteSheet(img);
        if (err) {
          error.textContent = err;
          fileInput.value = '';
          return;
        }

        try {
          await db.addCharacter(charName, dataUrl);
          nameInput.value = '';
          fileInput.value = '';
          error.textContent = '';
          await renderCharacters();
        } catch (e) {
          error.textContent = e.message?.includes('UNIQUE')
            ? 'Ya existe un personaje con ese nombre'
            : 'Error al guardar: ' + e.message;
        }
      };
      img.onerror = () => {
        error.textContent = 'No se pudo cargar la imagen';
        fileInput.value = '';
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });

  // Restaurar default: desactivar todos los personajes
  resetBtn.addEventListener('click', async () => {
    const active = await db.getActiveCharacter();
    if (active) {
      await db.deactivateAllCharacters();
    }
    await renderCharacters();
    emitToMain('config:sprite-changed', { spriteSheet: '' });
  });

  renderCharacters();
}

// =============================================
// TTS — Poblar voces del sistema
// =============================================

function populateVoices(selectedVoice) {
  const select = document.getElementById('cp-tts-voice');
  if (!select) return;
  select.innerHTML = '';

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '(voz por defecto del sistema)';
  select.appendChild(defaultOpt);

  if (window.speechSynthesis) {
    const voices = window.speechSynthesis.getVoices();
    // Priorizar voces en español
    const sorted = voices.sort((a, b) => {
      const aEs = a.lang.startsWith('es') ? 0 : 1;
      const bEs = b.lang.startsWith('es') ? 0 : 1;
      return aEs - bEs || a.name.localeCompare(b.name);
    });
    for (const v of sorted) {
      const opt = document.createElement('option');
      opt.value = v.name;
      const online = v.name.includes('Online') ? ' ★' : '';
      opt.textContent = `${v.name} (${v.lang})${online}`;
      if (selectedVoice && v.name === selectedVoice) opt.selected = true;
      select.appendChild(opt);
    }
  }
}

// =============================================
// Init
// =============================================

async function initApp() {
  db = await waitForDb();
  await db.init();

  await sync();
  listenEvents();
  initNav();
  initCharacters();

  // Cerrar
  document.getElementById('cp-close').addEventListener('click', closeWindow);

  // Reconectar
  document.getElementById('cp-reconnect').addEventListener('click', async () => {
    await save();
    emitToMain('config:reconnect');
  });

  // Botones guardar (uno por página)
  document.querySelectorAll('.cp-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      await save();
      btn.textContent = 'Guardado ✓';
      btn.classList.add('saved');
      setTimeout(() => {
        btn.textContent = 'Guardar';
        btn.classList.remove('saved');
      }, 1500);
    });
  });

  // Poblar voces del sistema cuando estén disponibles
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => populateVoices();
  }

  // Live update de labels de sliders TTS
  ['cp-tts-rate', 'cp-tts-pitch', 'cp-tts-volume'].forEach(id => {
    const el = document.getElementById(id);
    const label = document.getElementById(id + '-val');
    if (el && label) {
      el.addEventListener('input', () => { label.textContent = el.value; });
    }
  });

  // Live update de slider SFX
  const sfxVolEl = document.getElementById('cp-sfx-volume');
  const sfxVolLabel = document.getElementById('cp-sfx-volume-val');
  if (sfxVolEl && sfxVolLabel) {
    sfxVolEl.addEventListener('input', () => { sfxVolLabel.textContent = sfxVolEl.value; });
  }

  // Botón "Probar voz"
  const previewBtn = document.getElementById('cp-tts-preview');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance('Hola, esta es mi voz');
      const voiceName = document.getElementById('cp-tts-voice').value;
      if (voiceName) {
        const voice = window.speechSynthesis.getVoices().find(v => v.name === voiceName);
        if (voice) utter.voice = voice;
      }
      utter.rate = parseFloat(document.getElementById('cp-tts-rate').value) || 1;
      utter.pitch = parseFloat(document.getElementById('cp-tts-pitch').value) || 1;
      utter.volume = parseFloat(document.getElementById('cp-tts-volume').value) || 1;
      utter.lang = 'es-AR';
      window.speechSynthesis.speak(utter);
    });
  }

  // Guardar al cambiar cualquier input (excluir file inputs)
  document.querySelectorAll('input:not(#cp-new-char-file):not(#cp-new-char-name), select').forEach(el => {
    el.addEventListener('change', save);
  });

  // Restaurar defaults por sección
  const SECTION_KEYS = {
    fisica: ['physicsGravity', 'physicsWalkSpeed', 'physicsBounceFactor', 'physicsBounceThreshold', 'physicsTerminalVelocity'],
    comportamiento: [
      'behaviorCursorThreshold',
      'behaviorIdleMin', 'behaviorIdleMax', 'behaviorBlinkMin', 'behaviorBlinkMax',
      'behaviorLookMin', 'behaviorLookMax', 'behaviorWalkMin', 'behaviorWalkMax',
      'behaviorWeightBlink', 'behaviorWeightLook', 'behaviorWeightWalk',
      'behaviorFpsIdle', 'behaviorFpsBlink', 'behaviorFpsLook', 'behaviorFpsDrag',
      'emotionsEnabled', 'emotionHappyMs',
    ],
    apariencia: ['spriteScale', 'bubbleDismissMs', 'chatWidth', 'chatHeight', 'hoverDelayMs', 'chatHistoryEnabled', 'chatHistoryMax'],
    avanzado: ['whisperIdleMs', 'whisperMaxRamMb', 'reconnectBaseMs', 'reconnectMaxMs', 'holdToTalkMs', 'contextMenuEnabled', 'notificationsEnabled', 'autoUpdateEnabled'],
    sonidos: ['sfxEnabled', 'sfxVolume', 'sfxChat', 'sfxMessage', 'sfxMic', 'sfxConnect', 'sfxError'],
    atajos: ['hotkeyChat', 'hotkeyVisibility', 'hotkeyConfig', 'hotkeyDebug', 'hotkeyReconnect'],
  };

  document.querySelectorAll('.cp-reset-section').forEach(btn => {
    btn.addEventListener('click', async () => {
      const section = btn.dataset.section;
      const keys = SECTION_KEYS[section];
      if (keys) {
        await resetSection(keys);
        btn.textContent = 'Restaurado ✓';
        setTimeout(() => { btn.textContent = 'Restaurar defaults'; }, 1500);
      }
    });
  });
}

initApp();
