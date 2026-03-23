// Conexión WebSocket a terminal-live server
// Replica el patrón de Telegram: init sesión AI, enviar texto, recibir chunks
import { eventBus } from './event-bus.js';
import * as config from './config.js';
import { dbg } from './debug.js';

const RECONNECT_BASE_DEFAULT = 1000;
const RECONNECT_MAX_DEFAULT = 30000;

export class ServerConnection {
  constructor() {
    this._ws = null;
    this._sessionId = null;
    this._reconnectBase = config.get('reconnectBaseMs') ?? RECONNECT_BASE_DEFAULT;
    this._reconnectMax = config.get('reconnectMaxMs') ?? RECONNECT_MAX_DEFAULT;
    this._reconnectDelay = this._reconnectBase;
    this._reconnectTimer = null;
    this._intentionalClose = false;
    this._accumulatedText = '';
    this._busy = false;
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

  get busy() {
    return this._busy;
  }

  get sessionId() {
    return this._sessionId;
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
      this._sendInit();
      eventBus.emit('server:connected');
    };

    this._ws.onmessage = (e) => {
      this._handleMessage(e.data);
    };

    this._ws.onclose = () => {
      this._ws = null;
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
    clearTimeout(this._reconnectTimer);
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._sessionId = null;
  }

  // Enviar mensaje de texto al agente (como Telegram envía texto al bot)
  send(text) {
    dbg('server', 'send()', { text, connected: this.connected });
    if (!text.trim()) return;
    // Si está desconectado, encolar si está habilitado
    if (!this.connected) {
      if (config.get('offlineQueueEnabled') !== false) {
        this._messageQueue.push(text);
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

  // Enviar mensaje raw (para action_result/action_error)
  sendRaw(msg) {
    if (this.connected) {
      this._ws.send(JSON.stringify(msg));
    }
  }

  // No soportado en modo WebSocket directo (solo en NodrizaClient)
  sendCallback(callbackData) {
    // Not supported in direct WebSocket mode
  }

  // No soportado en modo WebSocket directo (solo en NodrizaClient)
  sendAudio(base64, format) {
    // Not supported in direct WebSocket mode
  }

  // Enviar init con sessionType "ai" (como Telegram crea una sesión)
  _sendInit() {
    if (!this._ws) return;

    const msg = {
      type: 'init',
      sessionType: 'ai'
    };

    const provider = config.get('provider');
    const agentKey = config.get('agentKey');
    const model = config.get('model');

    if (provider) msg.provider = provider;
    if (agentKey) msg.agentKey = agentKey;
    if (model) msg.model = model;

    this._ws.send(JSON.stringify(msg));
  }

  // Procesar mensaje del server
  _handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'session_id':
        this._sessionId = msg.id;
        eventBus.emit('server:session', { id: msg.id });
        break;

      case 'output':
        // Chunk de streaming (como onChunk de Telegram)
        if (msg.data) {
          this._accumulatedText += msg.data;
          eventBus.emit('server:chunk', {
            chunk: msg.data,
            accumulated: this._accumulatedText
          });
        }
        break;

      case 'exit':
        // Fin del stream
        this._finishResponse();
        break;

      case 'action':
        // Acción remota del server → dispatch al action-handler
        eventBus.emit('action:request', { id: msg.id, tool: msg.tool, args: msg.args });
        break;

      case 'buttons':
        eventBus.emit('server:buttons', msg.data);
        break;

      case 'voice':
        eventBus.emit('server:voice', msg.data);
        break;

      default:
        // Mensajes futuros (menu, mood, etc.)
        eventBus.emit('server:message', msg);
        break;
    }
  }

  // Marcar respuesta como completa
  _finishResponse() {
    const text = this._accumulatedText;
    this._accumulatedText = '';
    this._busy = false;
    eventBus.emit('server:done', { text });
    eventBus.emit('server:busy', false);
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
    this._reconnectTimer = setTimeout(() => {
      this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._reconnectMax);
      this.connect();
    }, this._reconnectDelay);
  }
}
