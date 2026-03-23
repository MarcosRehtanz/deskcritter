// Abre la configuración en una ventana Tauri separada
import { eventBus } from './event-bus.js';
import * as config from './config.js';

const PANEL_W = 900;
const PANEL_H = 600;

export class ConfigPanel {
  constructor() {
    this._win = null;
    this._listenReconnect();
  }

  get open() { return this._win != null; }

  toggle() {
    this._win ? this.close() : this.show();
  }

  async show() {
    if (this._win) {
      try { await this._win.setFocus(); } catch {}
      return;
    }

    try {
      const { WebviewWindow } = window.__TAURI__.webviewWindow;

      const win = new WebviewWindow('config', {
        url: 'config.html',
        title: 'Configuración',
        width: PANEL_W,
        height: PANEL_H,
        resizable: false,
        decorations: false,
        transparent: false,
        center: true,
      });

      win.once('tauri://created', () => {
        console.log('[config-panel] ventana creada');
        this._win = win;
        this._sendStatus();
      });

      win.once('tauri://error', (e) => {
        console.error('[config-panel] error al crear ventana:', e);
        this._win = null;
      });

      win.once('tauri://destroyed', () => {
        console.log('[config-panel] ventana cerrada');
        this._win = null;
      });
    } catch (e) {
      console.error('[config-panel] error:', e);
    }
  }

  async close() {
    if (!this._win) return;
    try {
      await this._win.close();
    } catch {}
    this._win = null;
  }

  async _sendStatus() {
    try {
      const { emit } = window.__TAURI__.event;
      const connected = eventBus._lastServerStatus || false;
      await emit('config:server-status', { connected });
    } catch {}
  }

  _listenReconnect() {
    try {
      const { listen } = window.__TAURI__.event;
      listen('config:reconnect', () => {
        eventBus.emit('config:reconnect');
      });
      // Escuchar cambios de config desde el panel secundario → actualizar cache + notificar módulos
      listen('config:changed', async (event) => {
        const partial = event.payload;
        if (partial && typeof partial === 'object') {
          await config.set(partial);
          eventBus.emit('config:updated', partial);
        }
      });
    } catch (e) {
      console.warn('[config-panel] no se pudo escuchar eventos Tauri:', e);
    }

    eventBus.on('server:connected', () => {
      eventBus._lastServerStatus = true;
      this._emitStatus(true);
    });
    eventBus.on('server:disconnected', () => {
      eventBus._lastServerStatus = false;
      this._emitStatus(false);
    });
  }

  async _emitStatus(connected) {
    if (!this._win) return;
    try {
      const { emit } = window.__TAURI__.event;
      await emit('config:server-status', { connected });
    } catch {}
  }
}
