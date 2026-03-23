// Efectos de sonido sintetizados con AudioContext
import { eventBus } from './event-bus.js';
import * as config from './config.js';
import { dbg } from './debug.js';

let _ctx = null;

function getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _ctx;
}

function isEnabled(key) {
  return config.get('sfxEnabled') !== false && config.get(key) !== false;
}

function getVolume() {
  return config.get('sfxVolume') ?? 0.5;
}

// Genera un tono corto sintetizado
function playTone(freq, duration, type = 'sine', volume = null) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const vol = volume ?? getVolume();
    gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    dbg('sfx', 'error reproduciendo tono', e);
  }
}

// Efecto: pop (abrir/cerrar chat)
function pop() {
  playTone(600, 0.08, 'sine');
  setTimeout(() => playTone(800, 0.06, 'sine'), 50);
}

// Efecto: ding (mensaje recibido)
function ding() {
  playTone(880, 0.15, 'sine');
  setTimeout(() => playTone(1100, 0.1, 'sine'), 100);
}

// Efecto: click (inicio grabación)
function click() {
  playTone(1000, 0.03, 'square');
}

// Efecto: chime (conexión establecida)
function chime() {
  playTone(523, 0.12, 'sine');
  setTimeout(() => playTone(659, 0.12, 'sine'), 120);
  setTimeout(() => playTone(784, 0.15, 'sine'), 240);
}

// Efecto: error
function errorSound() {
  playTone(300, 0.15, 'sawtooth');
  setTimeout(() => playTone(200, 0.2, 'sawtooth'), 100);
}

// Inicializar listeners del bus de eventos
export function initSfx() {
  dbg('sfx', 'inicializando efectos de sonido');

  // Suspender AudioContext cuando la app no está visible (ahorra CPU idle)
  document.addEventListener('visibilitychange', () => {
    if (!_ctx) return;
    if (document.hidden) {
      _ctx.suspend().catch(() => {});
    } else {
      _ctx.resume().catch(() => {});
    }
  });

  // Chat abierto/cerrado
  eventBus.on('bubble:show', () => {
    if (isEnabled('sfxChat')) pop();
  });

  // Mensaje recibido (respuesta completa)
  eventBus.on('server:done', () => {
    if (isEnabled('sfxMessage')) ding();
  });

  // Inicio de grabación
  eventBus.on('audio:started', () => {
    if (isEnabled('sfxMic')) click();
  });

  // Conexión establecida
  eventBus.on('server:connected', () => {
    if (isEnabled('sfxConnect')) chime();
  });

  // Mensaje proactivo (push)
  eventBus.on('server:push', () => {
    if (isEnabled('sfxMessage')) ding();
  });

  // Error de audio/transcripción
  eventBus.on('audio:error', () => {
    if (isEnabled('sfxError')) errorSound();
  });

  // Error de transcriber
  eventBus.on('transcriber:error', () => {
    if (isEnabled('sfxError')) errorSound();
  });
}
