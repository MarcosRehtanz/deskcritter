// Whisper STT local con @huggingface/transformers (WASM)
// Replica el patrón de terminal-live/server/transcriber.js para el WebView
import { eventBus } from './event-bus.js';
import * as config from './config.js';

// ─── Estado singleton ──────────────────────────────────────────
let _pipeline = null;
let _loadedModel = null;
let _loadingPromise = null;
let _idleTimer = null;
let _transformers = null;

// ─── Constantes ────────────────────────────────────────────────
const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

const MEMORY_THRESHOLDS_MB = {
  'Xenova/whisper-tiny':    600,
  'Xenova/whisper-base':    800,
  'Xenova/whisper-small':  1400,
};

const MODEL_FALLBACK_CHAIN = [
  'Xenova/whisper-small',
  'Xenova/whisper-base',
  'Xenova/whisper-tiny',
];

const MODELS_TO_PREDOWNLOAD = [
  'Xenova/whisper-small',
  'Xenova/whisper-base',
];

// Defaults (se sobreescriben desde config si disponibles)
const IDLE_TIMEOUT_MS_DEFAULT = 60 * 1000;
const MAX_RAM_MB_DEFAULT = 2048;

function getIdleTimeoutMs() {
  return config.get('whisperIdleMs') ?? IDLE_TIMEOUT_MS_DEFAULT;
}

function getMaxRamMb() {
  return config.get('whisperMaxRamMb') ?? MAX_RAM_MB_DEFAULT;
}

// ─── Funciones de soporte ──────────────────────────────────────

async function _getFreeMB() {
  try {
    return await window.__TAURI__.core.invoke('get_free_memory_mb');
  } catch {
    return (navigator.deviceMemory || 4) * 1024;
  }
}

async function _loadTransformers() {
  if (_transformers) return _transformers;
  _transformers = await import(/* webpackIgnore: true */ TRANSFORMERS_CDN);
  return _transformers;
}

async function _checkMemory(modelId) {
  const threshold = MEMORY_THRESHOLDS_MB[modelId];
  if (!threshold) return true;
  if (threshold > getMaxRamMb()) return false;
  const freeMB = await _getFreeMB();
  return freeMB >= threshold;
}

async function _resolveModel(preferredModel) {
  const startIdx = MODEL_FALLBACK_CHAIN.indexOf(preferredModel);
  const chain = startIdx >= 0
    ? MODEL_FALLBACK_CHAIN.slice(startIdx)
    : [preferredModel];

  for (const modelId of chain) {
    if (await _checkMemory(modelId)) {
      if (modelId !== preferredModel) {
        console.log(`[transcriber] Memoria insuficiente para ${preferredModel}, usando ${modelId}`);
        eventBus.emit('transcriber:fallback', { from: preferredModel, to: modelId });
      }
      return modelId;
    }
  }

  const freeMB = await _getFreeMB();
  const smallest = chain[chain.length - 1];
  const needMB = MEMORY_THRESHOLDS_MB[smallest] || 0;
  throw new Error(
    `Memoria insuficiente: ${smallest} necesita ${needMB}MB, disponible ${freeMB}MB`
  );
}

// ─── Gestión del pipeline ──────────────────────────────────────

async function _loadModel(modelId) {
  // Reusar pipeline si el modelo ya está cargado
  if (_pipeline && _loadedModel === modelId) {
    _resetIdleTimer();
    return _pipeline;
  }

  // Si hay otro modelo cargado, descargarlo primero
  if (_pipeline && _loadedModel !== modelId) {
    _unloadModel();
  }

  // Si ya hay una carga en curso, esperar
  if (_loadingPromise) {
    return _loadingPromise;
  }

  _loadingPromise = (async () => {
    try {
      const resolvedModel = await _resolveModel(modelId);
      console.log(`[transcriber] Cargando modelo ${resolvedModel}...`);
      eventBus.emit('transcriber:loading', { model: resolvedModel });

      const { pipeline } = await _loadTransformers();
      _pipeline = await pipeline('automatic-speech-recognition', resolvedModel, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (progress) => {
          eventBus.emit('transcriber:progress', progress);
        },
      });

      _loadedModel = resolvedModel;
      console.log(`[transcriber] Modelo ${resolvedModel} cargado`);
      eventBus.emit('transcriber:loaded', { model: resolvedModel });
      _resetIdleTimer();
      return _pipeline;
    } catch (err) {
      _pipeline = null;
      _loadedModel = null;
      eventBus.emit('transcriber:error', { error: err.message });
      throw err;
    } finally {
      _loadingPromise = null;
    }
  })();

  return _loadingPromise;
}

function _resetIdleTimer() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => _unloadModel(), getIdleTimeoutMs());
}

function _unloadModel() {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  if (_pipeline) {
    const model = _loadedModel;
    _pipeline = null;
    _loadedModel = null;
    console.log(`[transcriber] Modelo ${model || 'whisper'} descargado por inactividad`);
    eventBus.emit('transcriber:unloaded', { model });
  }
}

// ─── API pública ───────────────────────────────────────────────

// Transcribe PCM Float32 a 16kHz mono → texto
export async function transcribe(audioFloat32, opts = {}) {
  const model = opts.model || 'Xenova/whisper-base';
  const language = opts.language || 'es';

  const startIdx = MODEL_FALLBACK_CHAIN.indexOf(model);
  const chain = startIdx >= 0 ? MODEL_FALLBACK_CHAIN.slice(startIdx) : [model];

  for (let i = 0; i < chain.length; i++) {
    try {
      const pipe = await _loadModel(chain[i]);
      const result = await pipe(audioFloat32, {
        language,
        chunk_length_s: 30,
        return_timestamps: false,
      });

      _resetIdleTimer();
      const text = result.text.trim();
      if (!text) throw new Error('No se pudo extraer texto del audio');
      return text;
    } catch (err) {
      const isOom = err.message && (
        err.message.includes('Failed to allocate memory') ||
        err.message.includes('BFCArena') ||
        err.message.includes('AllocateRawInternal') ||
        err.message.includes('out of memory')
      );

      if (isOom && i < chain.length - 1) {
        console.log(`[transcriber] OOM con ${chain[i]}, bajando a ${chain[i + 1]}...`);
        _unloadModel();
        continue;
      }
      throw err;
    }
  }
}

// Descarga 2 modelos al Cache API sin cargar en RAM
export async function predownload() {
  const { AutoProcessor, AutoModelForSpeechSeq2Seq } = await _loadTransformers();

  for (const modelId of MODELS_TO_PREDOWNLOAD) {
    try {
      console.log(`[transcriber] Pre-descargando ${modelId}...`);
      eventBus.emit('transcriber:downloading', { model: modelId });

      await AutoProcessor.from_pretrained(modelId);
      await AutoModelForSpeechSeq2Seq.from_pretrained(modelId, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (progress) => {
          eventBus.emit('transcriber:download-progress', { model: modelId, ...progress });
        },
      });

      console.log(`[transcriber] ${modelId} descargado`);
      eventBus.emit('transcriber:downloaded', { model: modelId });
    } catch (err) {
      console.error(`[transcriber] Error descargando ${modelId}:`, err.message);
      eventBus.emit('transcriber:download-error', { model: modelId, error: err.message });
    }
  }
}

// Carga el modelo preferido en RAM (si hay memoria)
export async function preload(preferredModel = 'Xenova/whisper-small') {
  try {
    await _loadModel(preferredModel);
  } catch (err) {
    console.error(`[transcriber] Error al precargar:`, err.message);
  }
}

export function getLoadedModel() {
  return _loadedModel;
}

export function isLoaded() {
  return _pipeline !== null;
}

export function isLoading() {
  return _loadingPromise !== null;
}
