# Audio y voz

deskcritter soporta entrada de voz (STT) con Whisper local y salida de voz (TTS) con Web Speech API o audio streaming del server.

## STT — Whisper WASM

### Tecnología

- Librería: `@huggingface/transformers@3.8.1` vía CDN
- Runtime: ONNX en WebAssembly (WASM)
- Cuantización: q8 (enteros de 8 bits)
- Sin dependencias nativas — corre en el WebView (Chromium)

### Modelos disponibles

| Modelo | Tamaño | ID |
|--------|--------|----|
| Whisper base | ~800 MB | `Xenova/whisper-base` |
| Whisper tiny | ~600 MB | `Xenova/whisper-tiny` |

El modelo default es `whisper-base`. El modelo `whisper-small` (1.4 GB) fue descartado por consumir demasiada RAM; si estaba configurado, se migra automáticamente a `base`.

Límite de RAM: 2 GB máximo (`whisperMaxRamMb`). Modelos medium y large están excluidos.

### Flujo de audio

```
Botón de mic (click o hold)
  → MediaRecorder graba audio
  → Blob de audio
  → AudioContext.decodeAudioData()
  → Float32Array PCM a 16kHz (mono)
  → transcriber.transcribe(float32)
  → Whisper WASM procesa
  → texto transcrito
  → eventBus.emit('audio:result', { text })
  → server-connection.send({ type: "input", data: text })
```

### Gestión de memoria

El transcriber implementa una estrategia de gestión de memoria en tres fases:

#### 1. Pre-descarga (startup)

Si `whisperPredownload` es `true`, al arrancar se descargan los modelos al Cache API del navegador. No se cargan en RAM todavía.

#### 2. Pre-carga en RAM

Cuando se necesita transcribir por primera vez:
1. Se consulta la RAM disponible vía `invoke('get_free_memory_mb')` (Rust/sysinfo)
2. Se intenta cargar el modelo configurado
3. Si no hay suficiente RAM, se aplica la cadena de fallback:
   - `whisper-base` → `whisper-tiny` → error

#### 3. Descarga por inactividad (idle unload)

Después de `whisperIdleMs` (default: 60 segundos) sin uso:
- El modelo se descarga de RAM
- Se emite `transcriber:unloaded`
- Se vuelve a cargar automáticamente en el siguiente uso

### Modo de transcripción

- **Local** (`whisperLocal: true`, default): el audio se procesa localmente con Whisper WASM
- **Remoto** (`whisperLocal: false`): el audio se envía codificado en base64 al server como `{ type: "voice", audio: base64 }` para transcripción remota

### Eventos del transcriber

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `transcriber:loading` | `{ model }` | Cargando modelo en RAM |
| `transcriber:loaded` | `{ model }` | Modelo listo para uso |
| `transcriber:unloaded` | `{ model }` | Modelo descargado (idle) |
| `transcriber:downloading` | `{ model }` | Descargando al Cache API |
| `transcriber:download-progress` | `{ model, progress }` | Progreso de descarga |
| `transcriber:downloaded` | `{ model }` | Descarga completa |
| `transcriber:fallback` | `{ from, to }` | Fallback a modelo más chico |
| `transcriber:error` | `{ error }` | Error del transcriber |

## Captura de audio

El módulo `audio-capture.js` maneja la grabación de audio del micrófono.

### Modos de activación

- **Push-to-talk:** mantener presionado el botón de mic. Se activa si el click dura más de `holdToTalkMs` (default: 400ms)
- **Toggle:** click corto activa/desactiva la grabación

### Eventos de audio

| Evento | Descripción |
|--------|-------------|
| `audio:started` | Grabación iniciada |
| `audio:stopped` | Grabación detenida |
| `audio:transcribing` | Procesando audio con Whisper |
| `audio:result` `{ text }` | Texto transcrito |
| `audio:error` `{ error }` | Error de audio/transcripción |

## TTS — Text-to-Speech

### Browser Speech (local)

- API: `window.speechSynthesis` (nativo del WebView Chromium)
- Sin dependencias externas, funciona offline
- Voces dependen del sistema operativo
- Configurable: voz, velocidad, tono, volumen

Config keys: `ttsEnabled`, `ttsProvider: "browser"`, `ttsVoice`, `ttsRate`, `ttsPitch`, `ttsVolume`

### Server TTS (remoto)

Cuando el server tiene TTS configurado (Edge TTS, Piper, ElevenLabs, OpenAI, Google), envía audio streaming:

```
Server → { type: "audio", audio: "base64...", format: "mp3" }
```

Reproducción:
```
base64 → ArrayBuffer → AudioContext.decodeAudioData()
  → AudioBufferSourceNode → speakers
```

Config keys: `ttsEnabled`, `ttsProvider: "server"`

### Prioridad

Si el server envía audio TTS, se prioriza sobre el TTS local del browser para evitar reproducción duplicada.
