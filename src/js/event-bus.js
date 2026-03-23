// Bus de eventos para comunicación desacoplada entre módulos
import { dbg } from './debug.js';

class EventBus {
  constructor() {
    this._listeners = {};
  }

  // Suscribirse a un evento
  on(event, fn) {
    (this._listeners[event] ??= []).push(fn);
  }

  // Desuscribirse de un evento
  off(event, fn) {
    const list = this._listeners[event];
    if (!list) return;
    this._listeners[event] = list.filter(f => f !== fn);
  }

  // Suscribirse a un evento solo una vez
  once(event, fn) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      fn(data);
    };
    this.on(event, wrapper);
  }

  // Eventos que se emiten muy seguido — no loguear
  static _noisy = new Set(['input:cursorMove', 'transcriber:progress', 'transcriber:download-progress']);

  // Emitir un evento con datos opcionales
  emit(event, data) {
    if (!EventBus._noisy.has(event)) dbg('bus', event, data);
    const list = this._listeners[event];
    if (!list) return;
    [...list].forEach(fn => fn(data));
  }
}

export const eventBus = new EventBus();
