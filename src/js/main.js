// Orquestador principal: init, game loop, wiring de eventos
import { eventBus } from './event-bus.js';
import { SpriteAnimator } from './sprite.js';
import { StateMachine } from './state-machine.js';
import { Physics } from './physics.js';
import { WindowManager } from './window-manager.js';
import { InputHandler } from './input-handler.js';
import { setupPet, handleStateChange, reconfigurePet, PASSIVE_STATES, getCursorThreshold } from './pet-behavior.js';
import { ServerConnection } from './server-connection.js';
import { init as initActionHandler } from './action-handler.js';
import { SpeechBubble, cleanForTts } from './speech-bubble.js';
import { AudioCapture } from './audio-capture.js';
import { predownload, preload } from './transcriber.js';
import * as db from './db.js';
import * as config from './config.js';
import { ConfigPanel } from './config-panel.js';
import { ChatPanel } from './chat.js';
import { initDebug, dbg, toggleDebug } from './debug.js';
import { initSfx } from './sfx.js';
import { loadPlugins } from './plugin-loader.js';

const canvas = document.getElementById('critter');
const ctx = canvas.getContext('2d');

// --- Módulos core ---
const sprite = new SpriteAnimator(ctx, 32, 32, 3);
const fsm = new StateMachine();
const physics = new Physics(250);
const windowManager = new WindowManager();
const inputHandler = new InputHandler(canvas);

// --- Módulos de comunicación ---
// Se elige el transporte en init() según config (nodriza P2P o WebSocket directo)
let server = null;
const bubble = new SpeechBubble();
const audio = new AudioCapture();

// --- UI references ---
const chatBtn = document.getElementById('chat-btn');
const micBtn = document.getElementById('mic-btn');

// --- Configurar mascota ---
setupPet(sprite, fsm);

// --- Estado del game loop ---
let lastTime = 0;
let lastPosX = -1;
let lastPosY = -1;

// --- Anclaje de posición (se actualizan con drag) ---
const BASE_W = 96;
const BASE_H = 96;
const BUTTONS_H = 30;
let critterRight = 1144 + BASE_W;
let critterBottom = 447 + BASE_H;

// =============================================
// Wiring: Input del usuario (drag & cursor)
// =============================================

eventBus.on('input:dragStart', () => {
  fsm.forceState('drag');
  sprite.play('drag');
  physics.stopWalk();
});

eventBus.on('input:dragMove', async ({ deltaX, deltaY }) => {
  await windowManager.moveBy(deltaX, deltaY);
});

eventBus.on('input:dragEnd', async () => {
  const pos = await windowManager.getPosition();
  // Actualizar anclaje para que autoResize no salte a la posición vieja
  critterRight = pos.x + BASE_W;
  critterBottom = pos.y + BASE_H;
  chatPanel?.updateAnchor(critterRight, critterBottom);
  physics.setPosition(pos.x, pos.y);
  physics.release();

  // Detectar monitor destino y actualizar bounds
  const monitors = await windowManager.getAvailableMonitors();
  if (monitors.length > 1) {
    const critterCenter = pos.x + BASE_W / 2;
    const targetMonitor = monitors.find(m =>
      critterCenter >= m.x && critterCenter < m.x + m.width
    );
    if (targetMonitor) {
      physics.setMonitorBounds(targetMonitor);
    }
  }

  if (physics.y < physics.groundY) {
    fsm.forceState('fall');
    sprite.play('drag');
  } else {
    physics.y = physics.groundY;
    physics.grounded = true;
    fsm.forceState('idle');
    sprite.play('idle');
  }
});

eventBus.on('input:cursorMove', ({ mouseX, centerX }) => {
  if (!PASSIVE_STATES.includes(fsm.current)) return;
  const threshold = getCursorThreshold();

  if (mouseX < centerX - threshold && fsm.current !== 'look_left' && fsm.current !== 'blink') {
    fsm.forceState('look_left');
    sprite.play('look_left');
  } else if (mouseX > centerX + threshold && fsm.current !== 'look_right' && fsm.current !== 'blink') {
    fsm.forceState('look_right');
    sprite.play('look_right');
  }
});

// =============================================
// Wiring: Menú contextual
// =============================================

const ctxMenu = document.getElementById('context-menu');

eventBus.on('input:contextMenu', ({ x, y }) => {
  if (config.get('contextMenuEnabled') === false) return;
  if (!ctxMenu) return;
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
  ctxMenu.classList.add('visible');
});

// Cerrar menú al hacer click fuera o presionar Escape
document.addEventListener('click', () => {
  ctxMenu?.classList.remove('visible');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') ctxMenu?.classList.remove('visible');
});

// Acciones del menú contextual
ctxMenu?.addEventListener('click', (e) => {
  const item = e.target.closest('.ctx-item');
  if (!item) return;
  ctxMenu.classList.remove('visible');
  const action = item.dataset.action;
  switch (action) {
    case 'chat':
      chatPanel?.toggle();
      break;
    case 'mic':
      micToggle();
      break;
    case 'config':
      configPanel.toggle();
      break;
    case 'reconnect':
      server?.disconnect();
      server?.connect();
      bubble.show('Reconectando...');
      bubble.done();
      break;
    case 'hide':
      windowManager.toggleVisibility();
      break;
  }
});

// =============================================
// Wiring: Server (WebSocket a terminal-live)
// =============================================


// Chunk de streaming → mostrar en burbuja (solo si chat cerrado)
eventBus.on('server:chunk', ({ accumulated }) => {
  if (!chatPanel?.open) {
    bubble.show(accumulated);
  }
});

// Respuesta completa → iniciar timer de dismiss (solo si chat cerrado)
eventBus.on('server:done', () => {
  if (!chatPanel?.open) {
    bubble.done();
  }
});

// Botones inline → mostrar en burbuja (siempre, para interacción rápida)
eventBus.on('server:buttons', ({ text, buttons }) => {
  if (!chatPanel?.open) {
    if (text) bubble.show(text);
    bubble.showButtons(buttons);
  }
});

// Audio remoto → enviar PCM al server para transcripción
eventBus.on('audio:remote', ({ base64, format }) => {
  if (server?.sendAudio) {
    server.sendAudio(base64, format);
  }
});

// TTS — leer respuesta en voz alta (browser speech)
eventBus.on('server:done', ({ text }) => {
  if (config.get('ttsEnabled') && config.get('ttsProvider') === 'browser' && text?.trim()) {
    try {
      const utter = new SpeechSynthesisUtterance(cleanForTts(text));
      const voiceName = config.get('ttsVoice');
      if (voiceName && window.speechSynthesis) {
        const voice = window.speechSynthesis.getVoices().find(v => v.name === voiceName);
        if (voice) utter.voice = voice;
      }
      utter.lang = config.get('audioLang') || 'es-AR';
      utter.rate = config.get('ttsRate') ?? 1;
      utter.pitch = config.get('ttsPitch') ?? 1;
      utter.volume = config.get('ttsVolume') ?? 1;
      window.speechSynthesis?.speak(utter);
    } catch {}
  }
});

// Notificación del sistema cuando llega respuesta y la ventana no tiene foco
eventBus.on('server:done', ({ text }) => {
  if (config.get('notificationsEnabled') !== true) return;
  if (document.hasFocus()) return;
  try {
    if (Notification.permission === 'granted') {
      new Notification('DeskCritter', {
        body: text?.substring(0, 100) || 'Nueva respuesta',
        silent: true,
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  } catch {}
});

// TTS — reproducir audio del server (Edge TTS / Piper)
eventBus.on('server:voice', ({ base64 }) => {
  try {
    const audio = new Audio('data:audio/wav;base64,' + base64);
    audio.play();
  } catch {}
});

// =============================================
// Wiring: Emociones (estados de ánimo reactivos)
// =============================================

eventBus.on('server:busy', (busy) => {
  if (!config.get('emotionsEnabled')) return;
  if (busy) {
    fsm.forceState('thinking');
    sprite.play('think');
  }
});

eventBus.on('server:done', () => {
  if (!config.get('emotionsEnabled')) return;
  fsm.forceState('happy');
  sprite.play('happy');
});

eventBus.on('server:connected', () => {
  if (!config.get('emotionsEnabled')) return;
  fsm.forceState('celebrating');
  sprite.play('celebrate');
});

eventBus.on('server:disconnected', () => {
  if (!config.get('emotionsEnabled')) return;
  fsm.forceState('sad');
  sprite.play('sad');
});

// Click en botón de burbuja → enviar callback al server
eventBus.on('bubble:callback', (callbackData) => {
  if (server?.sendCallback) {
    server.sendCallback(callbackData);
  }
});

// =============================================
// Wiring: Indicador de conexión
// =============================================

const connBadge = document.getElementById('conn-badge');

function updateConnBadge(connected, transport) {
  if (!connBadge) return;
  const enabled = config.get('connBadgeEnabled') !== false;
  connBadge.style.display = enabled ? 'block' : 'none';
  if (connected) {
    connBadge.style.background = '#4caf50';
    connBadge.title = `Conectado (${transport || 'WebSocket'})`;
  } else {
    connBadge.style.background = '#f44336';
    connBadge.title = 'Desconectado';
  }
}

eventBus.on('server:connected', () => {
  const transport = config.get('nodrizaClientId') && config.get('nodrizaApiKey') ? 'P2P' : 'WebSocket';
  updateConnBadge(true, transport);
});

eventBus.on('server:disconnected', () => {
  updateConnBadge(false);
});

// =============================================
// Wiring: Audio (STT → enviar al server)
// =============================================

eventBus.on('audio:result', ({ text }) => {
  if (server.connected && !server.busy) {
    server.send(text);
  }
});

eventBus.on('audio:started', () => {
  micBtn.classList.add('listening');
});

eventBus.on('audio:stopped', () => {
  micBtn.classList.remove('listening');
});

eventBus.on('audio:transcribing', () => {
  micBtn.classList.add('transcribing');
  if (!chatPanel?.open) bubble.showDots();
});

eventBus.on('audio:result', ({ text }) => {
  micBtn.classList.remove('transcribing');
});

eventBus.on('audio:error', () => {
  micBtn.classList.remove('transcribing');
  bubble.hide();
});

// =============================================
// Wiring: Transcriber (Whisper local)
// =============================================

// Transcriber: sin mensajes en burbuja, solo log
eventBus.on('transcriber:error', ({ error }) => {
  dbg('transcriber', 'error', error);
});

// --- Control de micrófono ---
// Botón click y tecla M (tap) = toggle on/off
// Mantener M = push-to-talk (graba mientras se mantiene, transcribe al soltar)

let micToggleOn = false;  // estado toggle (modo abierto)
let micHolding = false;   // estado push-to-talk

function micToggle() {
  dbg('mic', 'toggle()', { supported: audio.supported, holding: micHolding, toggleOn: micToggleOn, listening: audio.listening });
  if (!audio.supported) return;
  if (micHolding) return; // no mezclar hold con toggle

  if (micToggleOn || audio.listening) {
    dbg('mic', 'toggle → OFF');
    audio.stop();
    micToggleOn = false;
  } else {
    dbg('mic', 'toggle → ON');
    audio.start();
    micToggleOn = true;
  }
}

micBtn.addEventListener('click', micToggle);

// Tap corto en Shift+M → toggle chat
eventBus.on('input:chatToggle', () => chatPanel?.toggle());

// Mantener Shift+M → push-to-talk (solo si el mic no está en modo toggle)
eventBus.on('input:micHoldStart', () => {
  dbg('mic', 'holdStart', { supported: audio.supported, toggleOn: micToggleOn, listening: audio.listening });
  if (!audio.supported) return;
  if (micToggleOn || audio.listening) return; // ya está grabando por toggle
  micHolding = true;
  dbg('mic', 'push-to-talk → ON');
  audio.start();
});

eventBus.on('input:micHoldEnd', () => {
  dbg('mic', 'holdEnd', { holding: micHolding });
  if (!micHolding) return;
  micHolding = false;
  audio.stop();
});

// --- Chat integrado ---
let chatPanel = null; // se inicializa en init() después de windowManager

// --- Panel de configuración (solo desde tray) ---
const configPanel = new ConfigPanel();

// Reconectar server desde el panel
eventBus.on('config:reconnect', () => {
  server.disconnect();
  server.connect();
});

// Config actualizada desde el panel → re-aplicar comportamiento y escala
eventBus.on('config:updated', (partial) => {
  reconfigurePet(sprite, fsm);
  // Cambio de escala del sprite
  const newScale = config.get('spriteScale');
  if (newScale && sprite.scale !== newScale) {
    sprite.setScale(newScale);
  }
});

// =============================================
// Game Loop
// =============================================

function gameLoop(timestamp) {
  const deltaTime = lastTime ? timestamp - lastTime : 16;
  lastTime = timestamp;

  const newState = fsm.update(deltaTime);
  if (newState) {
    handleStateChange(newState, { fsm, sprite, physics });
  }

  if (!inputHandler.isDragging) {
    const pos = physics.update(deltaTime);

    if (pos.grounded && fsm.current === 'fall') {
      fsm.forceState('idle');
      sprite.play('idle');
    }

    if (pos.hitEdge && (fsm.current === 'walk_left' || fsm.current === 'walk_right')) {
      fsm.forceState('idle');
      sprite.play('idle');
    }

    // DEBUG: desactivar movimiento de ventana para diagnosticar
    // if (pos.x !== lastPosX || pos.y !== lastPosY) {
    //   lastPosX = pos.x;
    //   lastPosY = pos.y;
    //   windowManager.setPosition(pos.x, pos.y);
    // }
  }

  sprite.update(deltaTime);
  sprite.draw();

  requestAnimationFrame(gameLoop);
}

// =============================================
// Placeholder (sin sprite sheet)
// =============================================

function drawPlaceholder() {
  const size = 96;
  function draw(timestamp) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#5b8c5a';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2 + 5, size / 2.5, 0, Math.PI * 2);
    ctx.fill();

    const breathe = Math.sin(timestamp / 800) * 2;
    const eyeY = canvas.height / 2 + breathe;
    const blinkCycle = timestamp % 4000;
    const isBlinking = blinkCycle > 3800;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(canvas.width / 2 - 10, eyeY - 3, isBlinking ? 1 : 6, 0, Math.PI * 2);
    ctx.arc(canvas.width / 2 + 10, eyeY - 3, isBlinking ? 1 : 6, 0, Math.PI * 2);
    ctx.fill();

    if (!isBlinking) {
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.arc(canvas.width / 2 - 9, eyeY - 2, 3, 0, Math.PI * 2);
      ctx.arc(canvas.width / 2 + 11, eyeY - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#2d4a2d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, eyeY + 9, 6, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

// =============================================
// Inicialización
// =============================================

async function init() {
  // Debug primero — lee env var desde Rust
  await initDebug();

  // Inicializar DB y config antes de todo
  dbg('main', 'init() arrancando...');
  await config.init();

  // Inicializar efectos de sonido
  initSfx();

  // Elegir transporte: nodriza P2P (si hay credenciales) o WebSocket directo
  if (config.get('nodrizaClientId') && config.get('nodrizaApiKey')) {
    const { NodrizaClient } = await import('./nodriza-client.js');
    server = new NodrizaClient();
    dbg('main', 'transporte: nodriza P2P');
  } else {
    server = new ServerConnection();
    dbg('main', 'transporte: WebSocket directo');
  }

  // Cargar sprite: primero personaje activo de DB, luego config legacy, luego default
  let spriteSource = '';
  const activeChar = await db.getActiveCharacter();
  if (activeChar) {
    spriteSource = activeChar.sprite;
    dbg('main', 'personaje activo:', activeChar.name);
  } else {
    spriteSource = config.get('spriteSheet');
    dbg('main', 'sin personaje activo, usando config/default');
  }
  try {
    await sprite.loadSheet(spriteSource || 'assets/critter.png');
    dbg('main', 'sprite cargado');
  } catch (err) {
    dbg('main', 'sprite falló, usando placeholder', err);
    drawPlaceholder();
    return;
  }

  // Escuchar cambio de sprite desde el panel de configuración
  try {
    const { listen } = window.__TAURI__.event;
    listen('config:sprite-changed', async (event) => {
      const src = event.payload?.spriteSheet || 'assets/critter.png';
      dbg('main', 'sprite cambiado desde config panel');
      try {
        await sprite.reloadSheet(src);
      } catch {
        await sprite.reloadSheet('assets/critter.png');
      }
    });
  } catch {}

  await windowManager.init();

  await windowManager.setSize(BASE_W, BASE_H);
  await windowManager.setPosition(critterRight - BASE_W, critterBottom - BASE_H);

  // Hover: la ventana crece hacia abajo para mostrar botones (con delay)
  let hovered = false;
  let hoverTimer = null;
  const critterArea = document.getElementById('critter-area');
  critterArea.addEventListener('mouseenter', () => {
    clearTimeout(hoverTimer);
    const delay = config.get('hoverDelayMs') ?? 300;
    hoverTimer = setTimeout(() => { hovered = true; autoResize(); }, delay);
  });
  critterArea.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimer);
    hovered = false;
    autoResize();
  });

  // Auto-resize: la ventana crece arriba (burbuja) y abajo (hover botones)
  // Se suspende cuando el chat está abierto (el chat maneja su propio layout)
  function autoResize() {
    if (chatPanel?.open) return;
    const bubbleEl = document.querySelector('.speech-bubble.visible');
    let newW = BASE_W;
    let extraTop = 0;      // espacio extra arriba (burbuja)
    let extraBottom = hovered ? BUTTONS_H : 0;  // espacio extra abajo (botones)
    const btns = document.getElementById('critter-buttons');
    if (btns) btns.classList.toggle('expanded', hovered);
    if (bubbleEl) {
      newW = Math.max(Math.ceil(bubbleEl.offsetWidth) + 8, BASE_W);
      extraTop = Math.ceil(bubbleEl.offsetHeight) + 8;
    }
    const newH = BASE_H + extraTop + extraBottom;
    windowManager.setSize(newW, newH);
    // Solo compensar posición por el espacio de arriba (burbuja), no por abajo (botones)
    windowManager.setPosition(critterRight - newW, critterBottom - BASE_H - extraTop);
    dbg('main', 'auto-resize', { w: newW, h: newH, hovered, extraTop, extraBottom });
  }
  eventBus.on('bubble:show', autoResize);
  eventBus.on('bubble:hide', autoResize);

  const monitor = await windowManager.getMonitorInfo();
  const pos = await windowManager.getPosition();
  dbg('main', 'monitor', monitor);
  dbg('main', 'posición inicial', pos);
  physics.setScreenBounds(monitor.width, monitor.height, monitor.scaleFactor);
  physics.setPosition(pos.x, pos.y);
  dbg('main', 'physics', { groundY: physics.groundY, y: physics.y, grounded: physics.grounded });

  // DEBUG: forzar grounded para que no caiga
  physics.grounded = true;
  physics.y = physics.groundY;

  // Iniciar chat panel
  chatPanel = new ChatPanel(windowManager, server, { right: critterRight, bottom: critterBottom });
  chatBtn.addEventListener('click', () => chatPanel.toggle());
  dbg('main', 'chat panel inicializado');

  // Iniciar input y game loop
  inputHandler.init();
  dbg('main', 'input handler y game loop iniciados');

  // Cargar plugins
  await loadPlugins(sprite, fsm);

  requestAnimationFrame(gameLoop);

  // Iniciar audio (solicita permiso de micrófono)
  await audio.init();
  dbg('main', 'audio init', { supported: audio.supported });

  // Precargar modelo Whisper en background (solo si transcripción local activa)
  if (config.get('whisperLocal') !== false) {
    const whisperModel = config.get('whisperModel') || 'Xenova/whisper-base';
    dbg('main', 'precargando Whisper', whisperModel);
    preload(whisperModel);
  } else {
    dbg('main', 'Whisper local desactivado — audio se enviará al server');
  }

  // --- Atajos globales configurables ---
  // Mapeo: key → acción. Se reconstruye al cambiar config.
  let hotkeyMap = {};

  function buildHotkeyMap() {
    hotkeyMap = {};
    hotkeyMap[(config.get('hotkeyChat') || 'M').toUpperCase()] = 'chat';
    hotkeyMap[(config.get('hotkeyVisibility') || 'H').toUpperCase()] = 'visibility';
    hotkeyMap[(config.get('hotkeyConfig') || 'C').toUpperCase()] = 'config';
    hotkeyMap[(config.get('hotkeyDebug') || 'D').toUpperCase()] = 'debug';
    hotkeyMap[(config.get('hotkeyReconnect') || 'R').toUpperCase()] = 'reconnect';
  }

  async function registerShortcuts() {
    buildHotkeyMap();
    const keys = Object.keys(hotkeyMap);
    try {
      await window.__TAURI__.core.invoke('register_shortcuts', { keys });
      dbg('main', 'shortcuts registrados:', keys.join(', '));
    } catch (e) {
      dbg('main', 'error registrando shortcuts:', e);
    }
  }

  await registerShortcuts();

  // Re-registrar cuando cambia la config de atajos
  eventBus.on('config:updated', (partial) => {
    if (partial.hotkeyChat || partial.hotkeyVisibility || partial.hotkeyConfig ||
        partial.hotkeyDebug || partial.hotkeyReconnect) {
      registerShortcuts();
    }
  });

  try {
    let holdTimer = null;
    let isHolding = false;

    const { listen } = window.__TAURI__.event;
    await listen('global-shortcut', (event) => {
      const { key, state } = event.payload;
      const action = hotkeyMap[key];
      if (!action) return;

      // Chat: tap = toggle chat, hold = push-to-talk
      if (action === 'chat') {
        if (state === 'Pressed') {
          isHolding = false;
          const holdMs = config.get('holdToTalkMs') ?? 400;
          holdTimer = setTimeout(() => {
            isHolding = true;
            eventBus.emit('input:micHoldStart');
          }, holdMs);
        } else if (state === 'Released') {
          clearTimeout(holdTimer);
          if (isHolding) {
            eventBus.emit('input:micHoldEnd');
            isHolding = false;
          } else {
            eventBus.emit('input:chatToggle');
          }
        }
        return;
      }

      // Los demás solo reaccionan a Pressed
      if (state !== 'Pressed') return;

      switch (action) {
        case 'visibility':
          windowManager.toggleVisibility();
          break;
        case 'config':
          configPanel.toggle();
          break;
        case 'debug': {
          const on = toggleDebug();
          bubble.show(on ? 'Debug activado' : 'Debug desactivado');
          bubble.done();
          break;
        }
        case 'reconnect':
          server.disconnect();
          server.connect();
          bubble.show('Reconectando...');
          bubble.done();
          break;
      }
    });
    dbg('main', 'global shortcuts listener registrado');
  } catch (e) {
    dbg('main', 'global shortcut listener falló:', e.message);
  }

  // Reconectar desde el tray
  try {
    const { listen: listenTray } = window.__TAURI__.event;
    await listenTray('tray:reconnect', () => {
      server.disconnect();
      server.connect();
    });
  } catch {}

  // HTTP API local — escuchar eventos del servidor HTTP
  try {
    const { listen: listenHttp } = window.__TAURI__.event;

    await listenHttp('http-api:message', (event) => {
      const text = event.payload?.text;
      if (text && server?.connected) {
        server.send(text);
      }
    });

    await listenHttp('http-api:action', (event) => {
      const action = event.payload?.action;
      if (action) {
        // Acciones simples: wave, happy, sad, thinking
        switch (action) {
          case 'wave':
          case 'celebrating':
            fsm.forceState('celebrating');
            sprite.play('celebrate');
            break;
          case 'happy':
            fsm.forceState('happy');
            sprite.play('happy');
            break;
          case 'sad':
            fsm.forceState('sad');
            sprite.play('sad');
            break;
          case 'thinking':
            fsm.forceState('thinking');
            sprite.play('think');
            break;
          case 'idle':
            fsm.forceState('idle');
            sprite.play('idle');
            break;
        }
      }
    });

    await listenHttp('http-api:webhook', (event) => {
      const { event: evtName, data } = event.payload || {};
      switch (evtName) {
        case 'notify':
          bubble.show(data?.text || data?.message || 'Notificación');
          bubble.done();
          break;
        case 'mood':
          if (data?.mood) {
            fsm.forceState(data.mood);
            const animMap = { happy: 'happy', sad: 'sad', thinking: 'think', celebrating: 'celebrate' };
            sprite.play(animMap[data.mood] || data.mood);
          }
          break;
      }
    });

    dbg('main', 'HTTP API listeners registrados');
  } catch {}

  // Inicializar action handler (ejecuta tools remotos del server)
  initActionHandler((msg) => server.sendRaw(msg));
  dbg('main', 'action handler inicializado');

  // Conectar al server
  dbg('main', 'conectando al server...');
  server.connect();

  dbg('main', 'init() completo');
}

init();
