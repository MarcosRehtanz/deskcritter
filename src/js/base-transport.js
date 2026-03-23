// Clase base de transporte — lógica compartida entre ServerConnection y NodrizaClient
import { eventBus } from './event-bus.js';
import * as config from './config.js';
import { dbg } from './debug.js';

export class BaseTransport {
  constructor(tag) {
    this._tag = tag;
    this._sessionId = null;
    this._accumulatedText = '';
    this._busy = false;
    this._initSent = false;
  }

  get busy() {
    return this._busy;
  }

  get sessionId() {
    return this._sessionId;
  }

  // Subclases deben implementar
  get connected() {
    throw new Error('connected getter not implemented');
  }

  // Subclases deben implementar: enviar objeto serializado
  _rawSend(_obj) {
    throw new Error('_rawSend not implemented');
  }

  // Subclases deben implementar
  connect() {
    throw new Error('connect not implemented');
  }

  // Subclases deben implementar
  disconnect() {
    throw new Error('disconnect not implemented');
  }

  // Enviar texto al agente
  send(text) {
    dbg(this._tag, 'send()', { text, connected: this.connected });
    if (!this.connected || !text.trim()) return;
    this._busy = true;
    this._accumulatedText = '';
    eventBus.emit('server:busy', true);
    this._rawSend({ type: 'input', data: text });
  }

  // Enviar mensaje raw (para action_result/action_error)
  sendRaw(msg) {
    if (!this.connected) return;
    this._rawSend(msg);
  }

  // Enviar callback de botón al server
  sendCallback(callbackData) {
    dbg(this._tag, 'sendCallback()', callbackData);
    if (!this.connected) return;
    this._rawSend({ type: 'callback', data: callbackData });
  }

  // Enviar init con sessionType "ai"
  _sendInit() {
    if (!this.connected) return;
    if (this._initSent) return;
    this._initSent = true;

    const msg = { type: 'init', sessionType: 'ai' };

    const provider = config.get('provider');
    const agentKey = config.get('agentKey');
    const model = config.get('model');

    if (provider) msg.provider = provider;
    if (agentKey) msg.agentKey = agentKey;
    if (model) msg.model = model;

    this._rawSend(msg);
  }

  // Procesar mensaje del server
  _handleMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'session_id':
        this._sessionId = msg.id;
        eventBus.emit('server:session', { id: msg.id });
        break;

      case 'output':
        if (msg.data) {
          this._accumulatedText += msg.data;
          eventBus.emit('server:chunk', {
            chunk: msg.data,
            accumulated: this._accumulatedText,
          });
        }
        break;

      case 'exit':
        this._finishResponse();
        break;

      case 'action':
        eventBus.emit('action:request', { id: msg.id, tool: msg.tool, args: msg.args });
        break;

      case 'buttons':
        eventBus.emit('server:buttons', msg.data);
        break;

      case 'voice':
        eventBus.emit('server:voice', msg.data);
        break;

      case 'push':
        eventBus.emit('server:push', { text: msg.data?.text || msg.data });
        break;

      default:
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

  // Resetear estado de init (llamar en disconnect y onclose)
  _resetInit() {
    this._initSent = false;
  }
}
