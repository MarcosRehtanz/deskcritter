// Conexión a terminal-live vía nodriza (señalización WebRTC → P2P DataChannel)
// Mismo contrato de eventos que ServerConnection para intercambiabilidad
import { eventBus } from './event-bus.js';
import * as config from './config.js';
import { dbg } from './debug.js';
import { BaseTransport } from './base-transport.js';

const RECONNECT_BASE_DEFAULT = 2000;
const RECONNECT_MAX_DEFAULT = 30000;

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class NodrizaClient extends BaseTransport {
  constructor() {
    super('nodriza');
    // Signaling WebSocket
    this._ws = null;
    this._authenticated = false;

    // WebRTC
    this._pc = null;
    this._dc = null;       // RTCDataChannel activo
    this._peerId = null;   // ID del server emparejado

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

  _rawSend(obj) {
    const data = JSON.stringify(obj);
    if (this._relayMode) {
      this._sendRelay(data);
    } else if (this._dc?.readyState === 'open') {
      this._dc.send(data);
    }
  }

  // Enviar audio para transcripción remota
  sendAudio(base64, format) {
    dbg('nodriza', 'sendAudio()', { size: base64?.length, format, connected: this.connected });
    if (!this.connected) return;
    this._rawSend({ type: 'audio', data: base64, format: format || 'webm' });
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
        this._resetInit();
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
      this._resetInit();
      eventBus.emit('server:disconnected');
      if (!this._intentionalClose) this._scheduleReconnect();
    };

    this._ws.onerror = () => {};
  }

  disconnect() {
    this._intentionalClose = true;
    this._resetInit();
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
        this._resetInit();
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
        this._resetInit();
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
        this._resetInit();
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

    // Timeout: si DataChannel no abre en 8s, pedir relay
    this._p2pTimer = setTimeout(() => {
      if (!this._dc || this._dc.readyState !== 'open') {
        dbg('nodriza', 'P2P timeout — solicitando relay');
        this._requestRelay();
      }
    }, 8000);
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
      this._resetInit();
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
      this._resetInit();
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
      try { this._dc.close(); } catch (e) { dbg('nodriza', 'error cerrando DC', e); }
      this._dc = null;
    }
    if (this._pc) {
      try { this._pc.close(); } catch (e) { dbg('nodriza', 'error cerrando PC', e); }
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
    // Jitter: delay * (0.5 – 1.0) para evitar thundering herd
    const jitter = this._reconnectDelay * (0.5 + Math.random() * 0.5);
    dbg('nodriza', `reconectando en ${Math.round(jitter)}ms...`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._reconnectMax);
      this.connect();
    }, jitter);
  }
}
