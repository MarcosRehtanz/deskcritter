// Conexión a terminal-live vía nodriza (señalización WebRTC → P2P DataChannel)
// Mismo contrato de eventos que ServerConnection para intercambiabilidad
import { eventBus } from './event-bus.js';
import * as config from './config.js';
import { dbg } from './debug.js';

const RECONNECT_BASE_DEFAULT = 2000;
const RECONNECT_MAX_DEFAULT = 30000;

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class NodrizaClient {
  constructor() {
    // Signaling WebSocket
    this._ws = null;
    this._authenticated = false;

    // WebRTC
    this._pc = null;
    this._dc = null;       // RTCDataChannel activo
    this._peerId = null;   // ID del server emparejado

    // Estado de sesión AI (misma interfaz que ServerConnection)
    this._sessionId = null;
    this._accumulatedText = '';
    this._busy = false;

    // Relay fallback (cuando P2P falla)
    this._relayMode = false;    // true si está en modo relay (P2P falló)
    this._p2pTimer = null;      // timeout para detectar fallo de P2P

    // Reconexión
    this._reconnectBase = config.get('reconnectBaseMs') ?? RECONNECT_BASE_DEFAULT;
    this._reconnectMax = config.get('reconnectMaxMs') ?? RECONNECT_MAX_DEFAULT;
    this._reconnectDelay = this._reconnectBase;
    this._reconnectTimer = null;
    this._intentionalClose = false;
  }

  get connected() {
    return this._dc?.readyState === 'open' || this._relayMode;
  }

  get busy() {
    return this._busy;
  }

  get sessionId() {
    return this._sessionId;
  }

  // ── Conectar a nodriza signaling ────────────────────────────────────────────

  connect() {
    this._intentionalClose = false;
    const url = config.get('nodrizaUrl');
    dbg('nodriza', 'conectando a', url);

    try {
      this._ws = new WebSocket(url);
    } catch {
      dbg('nodriza', 'URL inválida', url);
      eventBus.emit('server:error', { message: 'URL de nodriza inválida' });
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this._reconnectDelay = this._reconnectBase;
      dbg('nodriza', 'signaling WS abierto, autenticando...');
      this._authenticate();
    };

    this._ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this._handleSignalingMessage(msg);
    };

    this._ws.onclose = () => {
      this._ws = null;
      this._authenticated = false;
      dbg('nodriza', 'signaling WS cerrado');

      // Si estaba en relay mode, también perdimos la conexión
      if (this._relayMode) {
        this._relayMode = false;
        eventBus.emit('server:disconnected');
        if (!this._intentionalClose) this._scheduleReconnect();
        return;
      }

      // Si P2P está activo, no cerrar ni reconectar (nodriza ya no necesaria)
      if (this.connected) {
        dbg('nodriza', 'P2P sigue activo, signaling no necesario');
        return;
      }
      // Sin P2P → notificar desconexión y reconectar
      this._closePeer();
      eventBus.emit('server:disconnected');
      if (!this._intentionalClose) this._scheduleReconnect();
    };

    this._ws.onerror = () => {};
  }

  disconnect() {
    this._intentionalClose = true;
    clearTimeout(this._reconnectTimer);
    clearTimeout(this._p2pTimer);
    this._closePeer();
    this._relayMode = false;
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._authenticated = false;
    this._sessionId = null;
  }

  // Enviar mensaje al server (por DataChannel P2P o relay)
  send(text) {
    dbg('nodriza', 'send()', { text, connected: this.connected, relay: this._relayMode });
    if (!this.connected || !text.trim()) return;
    this._busy = true;
    this._accumulatedText = '';
    eventBus.emit('server:busy', true);

    const msg = JSON.stringify({ type: 'input', data: text });
    if (this._relayMode) {
      this._sendRelay(msg);
    } else {
      this._dc.send(msg);
    }
  }

  // Enviar mensaje raw (para action_result/action_error)
  sendRaw(msg) {
    if (!this.connected) return;
    const data = JSON.stringify(msg);
    if (this._relayMode) {
      this._sendRelay(data);
    } else {
      this._dc.send(data);
    }
  }

  // Enviar audio para transcripción remota
  sendAudio(base64, format) {
    dbg('nodriza', 'sendAudio()', { size: base64?.length, format, connected: this.connected });
    if (!this.connected) return;
    const msg = JSON.stringify({ type: 'audio', data: base64, format: format || 'webm' });
    if (this._relayMode) {
      this._sendRelay(msg);
    } else {
      this._dc.send(msg);
    }
  }

  // Enviar callback de botón al server
  sendCallback(callbackData) {
    dbg('nodriza', 'sendCallback()', callbackData);
    if (!this.connected) return;
    const msg = JSON.stringify({ type: 'callback', data: callbackData });
    if (this._relayMode) {
      this._sendRelay(msg);
    } else {
      this._dc.send(msg);
    }
  }

  // ── Signaling ─────────────────────────────────────────────────────────────

  _authenticate() {
    const id = config.get('nodrizaClientId');
    const apiKey = config.get('nodrizaApiKey');
    this._sendSignaling({
      event: 'auth',
      data: { id, apiKey, role: 'client' },
    });
  }

  _handleSignalingMessage(msg) {
    switch (msg.event) {
      case 'auth:ok':
        this._authenticated = true;
        dbg('nodriza', 'autenticado, peers:', msg.data.connectedPeers);
        // Si ya hay un server conectado, esperar su offer
        if (msg.data.connectedPeers?.length > 0) {
          this._peerId = msg.data.connectedPeers[0];
          dbg('nodriza', 'server ya conectado:', this._peerId);
        }
        break;

      case 'auth:error':
        dbg('nodriza', 'auth error:', msg.data?.message);
        eventBus.emit('server:error', { message: 'Nodriza auth: ' + (msg.data?.message || 'error') });
        break;

      case 'peer:connected':
        dbg('nodriza', 'peer conectado:', msg.data.peerId, msg.data.role);
        this._peerId = msg.data.peerId;
        break;

      case 'peer:disconnected':
        dbg('nodriza', 'peer desconectado:', msg.data.peerId);
        this._relayMode = false;
        this._closePeer();
        eventBus.emit('server:disconnected');
        break;

      case 'signal:offer':
        dbg('nodriza', 'offer recibida de', msg.data.fromId);
        this._handleOffer(msg.data.fromId, msg.data.sdp);
        break;

      case 'signal:answer':
        dbg('nodriza', 'answer recibida de', msg.data.fromId);
        this._handleAnswer(msg.data.fromId, msg.data.sdp);
        break;

      case 'signal:ice-candidate':
        this._handleIceCandidate(msg.data.fromId, msg.data.candidate);
        break;

      case 'relay:activated':
        dbg('nodriza', 'relay activado con', msg.data.peerId);
        this._peerId = msg.data.peerId;
        this._relayMode = true;
        eventBus.emit('server:connected');
        this._sendInit();
        break;

      case 'relay:message':
        if (this._relayMode) {
          const payload = msg.data.payload;
          this._handleMessage(JSON.stringify(payload));
        }
        break;

      case 'error':
        dbg('nodriza', 'error:', msg.data?.message);
        break;
    }
  }

  // ── WebRTC ────────────────────────────────────────────────────────────────

  async _handleOffer(fromId, sdp) {
    this._peerId = fromId;

    // Cerrar PC anterior si existe
    if (this._pc) this._closePeer();

    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    this._pc = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this._sendSignaling({
          event: 'signal:ice-candidate',
          data: {
            targetId: fromId,
            candidate: {
              candidate: e.candidate.candidate,
              sdpMid: e.candidate.sdpMid,
              sdpMLineIndex: e.candidate.sdpMLineIndex,
            },
          },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      dbg('nodriza', 'connection state:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this._closePeer();
        eventBus.emit('server:disconnected');
      }
    };

    // terminal-live crea el DataChannel, nosotros lo recibimos
    pc.ondatachannel = (e) => {
      dbg('nodriza', 'DataChannel recibido:', e.channel.label);
      this._dc = e.channel;
      this._setupDataChannel(e.channel);
    };

    // Establecer offer y crear answer
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this._sendSignaling({
      event: 'signal:answer',
      data: { targetId: fromId, sdp: answer.sdp },
    });

    // Timeout: si DataChannel no abre en 15s, pedir relay
    this._p2pTimer = setTimeout(() => {
      if (!this._dc || this._dc.readyState !== 'open') {
        dbg('nodriza', 'P2P timeout — solicitando relay');
        this._requestRelay();
      }
    }, 15000);
  }

  async _handleAnswer(fromId, sdp) {
    // El client normalmente no envía offers, pero por si acaso
    if (!this._pc) return;
    await this._pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
  }

  _handleIceCandidate(fromId, candidate) {
    if (!this._pc) return;
    this._pc.addIceCandidate(new RTCIceCandidate({
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
    }));
  }

  _setupDataChannel(dc) {
    dc.onopen = () => {
      // P2P exitoso — limpiar timeout y notificar
      if (this._p2pTimer) {
        clearTimeout(this._p2pTimer);
        this._p2pTimer = null;
      }
      this._sendSignaling({ event: 'p2p:established' });

      dbg('nodriza', 'DataChannel abierto — enviando init');
      eventBus.emit('server:connected');
      this._sendInit();

      // Signaling WS se mantiene abierto (idle) para que nodriza no envíe peer:disconnected
      // Si se cierra el WS, nodriza notifica al server que el client se desconectó
    };

    dc.onmessage = (e) => {
      this._handleMessage(e.data);
    };

    dc.onclose = () => {
      dbg('nodriza', 'DataChannel cerrado');
      this._dc = null;
      eventBus.emit('server:disconnected');

      // P2P perdido → reconectar a nodriza para re-señalización
      if (!this._intentionalClose) {
        dbg('nodriza', 'P2P perdido — reconectando a nodriza para re-señalización');
        this._scheduleReconnect();
      }
    };

    dc.onerror = (e) => {
      dbg('nodriza', 'DataChannel error:', e);
    };
  }

  // ── Protocolo AI (mismo que ServerConnection) ─────────────────────────────

  _sendInit() {
    if (!this.connected) return;

    const msg = { type: 'init', sessionType: 'ai' };

    const provider = config.get('provider');
    const agentKey = config.get('agentKey');
    const model = config.get('model');

    if (provider) msg.provider = provider;
    if (agentKey) msg.agentKey = agentKey;
    if (model) msg.model = model;

    const data = JSON.stringify(msg);
    if (this._relayMode) {
      this._sendRelay(data);
    } else if (this._dc && this._dc.readyState === 'open') {
      this._dc.send(data);
    }
  }

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
        // Acción remota del server → dispatch al action-handler
        eventBus.emit('action:request', { id: msg.id, tool: msg.tool, args: msg.args });
        break;

      case 'buttons':
        eventBus.emit('server:buttons', msg.data);
        break;

      case 'voice':
        eventBus.emit('server:voice', { base64: msg.data });
        break;

      default:
        eventBus.emit('server:message', msg);
        break;
    }
  }

  _finishResponse() {
    const text = this._accumulatedText;
    this._accumulatedText = '';
    this._busy = false;
    eventBus.emit('server:done', { text });
    eventBus.emit('server:busy', false);
  }

  // ── Relay fallback ──────────────────────────────────────────────────────

  _requestRelay() {
    // Cerrar intento P2P fallido
    this._closePeer();
    // Pedir relay a nodriza
    this._sendSignaling({ event: 'p2p:failed' });
  }

  _sendRelay(jsonString) {
    if (!this._peerId) return;
    this._sendSignaling({
      event: 'relay',
      data: { targetId: this._peerId, payload: JSON.parse(jsonString) },
    });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /** Cerrar signaling WS sin disparar reconexión (P2P ya establecido) */
  _closeSignaling() {
    if (this._ws) {
      dbg('nodriza', 'cerrando signaling WS (P2P establecido)');
      const ws = this._ws;
      this._ws = null;
      // Quitar onclose para no disparar reconexión
      ws.onclose = null;
      ws.close();
    }
  }

  _closePeer() {
    if (this._dc) {
      try { this._dc.close(); } catch {}
      this._dc = null;
    }
    if (this._pc) {
      try { this._pc.close(); } catch {}
      this._pc = null;
    }
    this._peerId = null;
  }

  // ── Utils ─────────────────────────────────────────────────────────────────

  _sendSignaling(msg) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(msg));
    }
  }

  _scheduleReconnect() {
    clearTimeout(this._reconnectTimer);
    dbg('nodriza', `reconectando en ${this._reconnectDelay}ms...`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._reconnectMax);
      this.connect();
    }, this._reconnectDelay);
  }
}
