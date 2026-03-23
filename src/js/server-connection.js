// Conexión WebSocket a terminal-live server
// Replica el patrón de Telegram: init sesión AI, enviar texto, recibir chunks
import { eventBus } from './event-bus.js';
import * as config from './config.js';
import { dbg } from './debug.js';
import { BaseTransport } from './base-transport.js';

const RECONNECT_BASE_DEFAULT = 1000;
const RECONNECT_MAX_DEFAULT = 30000;
const OFFLINE_QUEUE_MAX = 50;

export class ServerConnection extends BaseTransport {
  constructor() {
    super('server');
    this._ws = null;
    this._reconnectBase = config.get('reconnectBaseMs') ?? RECONNECT_BASE_DEFAULT;
    this._reconnectMax = config.get('reconnectMaxMs') ?? RECONNECT_MAX_DEFAULT;
    this._reconnectDelay = this._reconnectBase;
    this._reconnectTimer = null;
    this._intentionalClose = false;
    this._retryCount = 0;
    this._offline = false;
    this._messageQueue = [];
  }

  get connected() {
    return this._ws?.readyState === WebSocket.OPEN;
  }

  get offline() {
    return this._offline;
  }

  _rawSend(obj) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
    }
  }

  // Enviar texto — override para agregar '\n' y offline queue
  send(text) {
    dbg('server', 'send()', { text, connected: this.connected });
    if (!text.trim()) return;
    // Si está desconectado, encolar si está habilitado
    if (!this.connected) {
      if (config.get('offlineQueueEnabled') !== false) {
        this._messageQueue.push(text);
        // Descartar mensajes viejos si se excede el límite
        if (this._messageQueue.length > OFFLINE_QUEUE_MAX) {
          this._messageQueue.shift();
        }
        dbg('server', 'mensaje encolado (offline)', { queueSize: this._messageQueue.length });
        eventBus.emit('server:queued', { text, queueSize: this._messageQueue.length });
      }
      return;
    }
    this._busy = true;
    this._accumulatedText = '';
    eventBus.emit('server:busy', true);

    this._ws.send(JSON.stringify({
      type: 'input',
      data: text + '\n'
    }));
  }

  // No soportado en modo WebSocket directo (solo en NodrizaClient)
  sendAudio(base64, format) {
    // Not supported in direct WebSocket mode
  }

  // Conectar al server y enviar init
  connect() {
    this._intentionalClose = false;
    const url = config.get('serverUrl');

    dbg('server', 'conectando a', url);
    try {
      this._ws = new WebSocket(url);
    } catch {
      dbg('server', 'URL inválida', url);
      eventBus.emit('server:error', { message: 'URL inválida' });
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this._reconnectDelay = this._reconnectBase;
      dbg('server', 'WebSocket abierto');
      // Salir de modo offline
      if (this._offline) {
        this._offline = false;
        eventBus.emit('server:offline', false);
        this._flushQueue();
      }
      this._retryCount = 0;
      this._resetInit();
      this._sendInit();
      eventBus.emit('server:connected');
    };

    this._ws.onmessage = (e) => {
      this._handleMessage(e.data);
    };

    this._ws.onclose = () => {
      this._ws = null;
      this._resetInit();
      dbg('server', 'WebSocket cerrado', { intentional: this._intentionalClose });
      eventBus.emit('server:disconnected');
      if (!this._intentionalClose) {
        this._scheduleReconnect();
      }
    };

    this._ws.onerror = () => {
      // onclose se dispara después, no duplicar lógica
    };
  }

  // Desconectar intencionalmente
  disconnect() {
    this._intentionalClose = true;
    this._resetInit();
    clearTimeout(this._reconnectTimer);
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._sessionId = null;
  }

  // Enviar mensajes encolados al reconectar
  _flushQueue() {
    if (this._messageQueue.length === 0) return;
    dbg('server', 'enviando cola de mensajes', { count: this._messageQueue.length });
    const queue = [...this._messageQueue];
    this._messageQueue = [];
    // Enviar el primer mensaje; los demás se envían cuando termine
    if (queue.length > 0) {
      this.send(queue[0]);
      // Los demás se agregan de vuelta para enviar secuencialmente
      this._messageQueue = queue.slice(1);
    }
  }

  // Reconexión con backoff exponencial
  _scheduleReconnect() {
    clearTimeout(this._reconnectTimer);
    this._retryCount++;
    const maxRetries = config.get('offlineMaxRetries') ?? 5;
    if (maxRetries > 0 && this._retryCount >= maxRetries && !this._offline) {
      this._offline = true;
      eventBus.emit('server:offline', true);
    }
    // Jitter: delay * 2 * (0.5 – 1.0) para evitar thundering herd
    const jitter = this._reconnectDelay * (0.5 + Math.random() * 0.5);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._reconnectMax);
      this.connect();
    }, jitter);
  }
}
