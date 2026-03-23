// Captura de voz con MediaRecorder + Whisper local
// Graba audio → PCM Float32 16kHz → transcriber → emite texto
import { eventBus } from './event-bus.js';
import * as config from './config.js';
import { transcribe } from './transcriber.js';
import { dbg } from './debug.js';

export class AudioCapture {
  constructor() {
    this._stream = null;
    this._mediaRecorder = null;
    this._audioChunks = [];
    this._supported = false;
    this._listening = false;
    this._transcribing = false;
    this._cachedMimeType = null;
  }

  get supported() { return this._supported; }
  get listening() { return this._listening; }
  get transcribing() { return this._transcribing; }

  // Solicitar permiso de micrófono
  async init() {
    this._supported = !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    );
    dbg('audio', 'APIs disponibles:', this._supported);
    if (!this._supported) return;

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      this._cachedMimeType = this._getSupportedMimeType();
      dbg('audio', 'micrófono autorizado, mimeType:', this._cachedMimeType);
    } catch (err) {
      dbg('audio', 'micrófono denegado:', err.message);
      this._supported = false;
    }
  }

  // Empezar a grabar (push-to-talk)
  start() {
    dbg('audio', 'start() llamado', { supported: this._supported, listening: this._listening, transcribing: this._transcribing });
    if (!this._supported || this._listening) return;
    if (!this._stream) return;

    this._audioChunks = [];
    this._mediaRecorder = new MediaRecorder(this._stream, {
      mimeType: this._cachedMimeType || this._getSupportedMimeType(),
    });

    this._mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this._audioChunks.push(e.data);
    };

    this._mediaRecorder.onstop = () => {
      this._listening = false;
      eventBus.emit('audio:stopped');
      this._processAudio();
    };

    this._mediaRecorder.start();
    this._listening = true;
    eventBus.emit('audio:started');
  }

  // Parar grabación → dispara transcripción
  stop() {
    dbg('audio', 'stop() llamado', { listening: this._listening });
    if (!this._listening || !this._mediaRecorder) return;
    try {
      this._mediaRecorder.stop();
    } catch (e) { dbg('audio', 'error parando recorder', e); }
  }

  _getSupportedMimeType() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  // Procesar audio grabado: local (Whisper WASM) o remoto (enviar al server)
  async _processAudio() {
    dbg('audio', '_processAudio()', { chunks: this._audioChunks.length });
    if (this._audioChunks.length === 0) return;

    const useLocal = config.get('whisperLocal') !== false;

    this._transcribing = true;
    eventBus.emit('audio:transcribing');

    try {
      const blob = new Blob(this._audioChunks, {
        type: this._mediaRecorder?.mimeType || 'audio/webm'
      });
      dbg('audio', 'blob creado', { size: blob.size, type: blob.type });

      // Decodificar a PCM Float32 16kHz (necesario tanto para local como remoto)
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });
      let pcm;
      try {
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        pcm = audioBuffer.getChannelData(0);
        dbg('audio', 'PCM decodificado', { samples: pcm.length, sampleRate: audioBuffer.sampleRate, duration: (pcm.length / audioBuffer.sampleRate).toFixed(2) + 's' });

        if (audioBuffer.sampleRate !== 16000) {
          dbg('audio', 'resampleando', { from: audioBuffer.sampleRate, to: 16000 });
          pcm = _resample(pcm, audioBuffer.sampleRate, 16000);
        }
      } finally {
        await audioCtx.close();
      }

      if (!useLocal) {
        // Enviar PCM como base64 al server para transcripción remota
        dbg('audio', 'modo remoto — enviando PCM al server', { samples: pcm.length });
        const pcmBase64 = _float32ToBase64(pcm);
        eventBus.emit('audio:remote', { base64: pcmBase64, format: 'pcm_f32_16k' });
        this._transcribing = false;
        this._audioChunks = [];
        return;
      }

      const whisperModel = config.get('whisperModel') || 'Xenova/whisper-base';
      const lang = config.get('whisperLang') || 'es';
      dbg('audio', 'enviando a Whisper local', { model: whisperModel, lang });

      const text = await transcribe(pcm, { model: whisperModel, language: lang });
      dbg('audio', 'transcripción OK', { text });
      eventBus.emit('audio:result', { text });
    } catch (err) {
      dbg('audio', 'ERROR en transcripción', err.message);
      eventBus.emit('audio:error', { error: err.message });
    } finally {
      this._transcribing = false;
      this._audioChunks = [];
    }
  }
}

// Float32Array a base64 (PCM raw)
function _float32ToBase64(float32) {
  const bytes = new Uint8Array(float32.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Blob a base64 data URL
function _blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Resampleo lineal de Float32Array
function _resample(float32, fromRate, toRate) {
  const ratio = fromRate / toRate;
  const newLength = Math.floor(float32.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, float32.length - 1);
    const frac = srcIdx - lo;
    result[i] = float32[lo] * (1 - frac) + float32[hi] * frac;
  }
  return result;
}
