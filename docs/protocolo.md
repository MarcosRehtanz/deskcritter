# Protocolo de comunicación

deskcritter se comunica con terminal-live mediante dos transportes intercambiables. Ambos usan el mismo formato de mensajes JSON.

## Transporte 1: WebSocket directo

Conexión directa al servidor terminal-live.

### Handshake

```
Cliente → ws://host:3001/
Cliente → { type: "init", sessionType: "ai", provider: "...", agentKey: "..." }
Server ← { type: "session_id", id: "uuid" }
```

### Reconexión

Reconexión automática con backoff exponencial:
- Delay base: `reconnectBaseMs` (default: 1000ms)
- Delay máximo: `reconnectMaxMs` (default: 30000ms)

## Transporte 2: P2P vía nodriza

Conexión peer-to-peer usando WebRTC, con señalización a través de nodriza.

### Flujo de conexión

```
1. WebSocket → nodriza /signaling
2. Auth: { event: "auth", data: { id, apiKey, role: "client" } }
3. Esperar peer:connected del server emparejado
4. Recibir signal:offer → crear RTCPeerConnection + answer
5. Intercambiar ICE candidates
6. DataChannel abierto → enviar init (mismo JSON que WebSocket)
```

### Diagrama de secuencia

```
  deskcritter           nodriza            terminal-live
      │                    │                     │
      │──── auth ─────────→│                     │
      │                    │←──── auth ──────────│
      │←─ peer:connected ──│                     │
      │                    │←── signal:offer ────│
      │←── signal:offer ───│                     │
      │─── signal:answer ─→│                     │
      │                    │── signal:answer ────→│
      │←── ice:candidate ──│←── ice:candidate ───│
      │─── ice:candidate ─→│── ice:candidate ───→│
      │                    │                     │
      │◄════════ DataChannel P2P ════════════════►│
      │── init ──────────────────────────────────→│
      │←── session_id ───────────────────────────│
```

Usa `RTCPeerConnection` nativo del WebView (Chromium). Sin dependencias extra.

## Tipos de mensaje

### Cliente → Server

| Tipo | Payload | Descripción |
|------|---------|-------------|
| `init` | `{ sessionType, provider?, agentKey? }` | Inicialización de sesión |
| `input` | `{ data: "texto" }` | Mensaje de texto del usuario |
| `callback` | `{ data: "callback_data" }` | Click en botón inline |
| `voice` | `{ audio: "base64" }` | Audio grabado para transcripción remota |
| `action_result` | `{ id, result }` | Resultado de ejecución de tool |
| `action_error` | `{ id, error }` | Error de ejecución de tool |

### Server → Cliente

| Tipo | Payload | Descripción |
|------|---------|-------------|
| `session_id` | `{ id: "uuid" }` | ID de sesión asignado |
| `output` | `{ data: "chunk" }` | Chunk de streaming de texto |
| `exit` | — | Fin del stream de respuesta |
| `buttons` | `{ buttons: [{text, callback_data}] }` | Botones inline |
| `audio` | `{ audio: "base64", format: "mp3" }` | Audio TTS del server |
| `action` | `{ id, tool, args }` | Solicitud de ejecución remota de tool |
| `push` | `{ text }` | Mensaje proactivo del server |

## Flujos de conversación

### Chat de texto

```
Usuario escribe texto
  → { type: "input", data: "hola" }
  ← { type: "output", data: "¡" }         # chunk 1
  ← { type: "output", data: "Hola" }      # chunk 2
  ← { type: "output", data: "!" }         # chunk 3
  ← { type: "exit" }                       # fin
```

### Voz (Whisper local)

```
Usuario mantiene presionado el botón de mic
  → MediaRecorder graba audio
  → AudioContext convierte a Float32 PCM 16kHz
  → Whisper WASM transcribe localmente
  → { type: "input", data: "texto transcrito" }
  ← (streaming de respuesta, igual que texto)
```

### Voz (transcripción remota)

```
Usuario graba audio (whisperLocal = false)
  → { type: "voice", audio: "base64..." }
  ← (el server transcribe y responde)
```

### Botones inline

```
  ← { type: "buttons", buttons: [
       { text: "Opción A", callback_data: "opt_a" },
       { text: "Opción B", callback_data: "opt_b" }
     ]}
  → { type: "callback", data: "opt_a" }     # usuario clickea
  ← (streaming de respuesta)
```

### Ejecución remota de tools (actions)

```
  ← { type: "action", id: "uuid", tool: "bash", args: { command: "dir" } }
  → action-handler.js despacha al tool correspondiente
  → Tauri invoke ejecuta en Rust
  → { type: "action_result", id: "uuid", result: { stdout, stderr, exit_code } }
```

O en caso de error:

```
  → { type: "action_error", id: "uuid", error: "mensaje de error" }
```

### Mensajes proactivos (push)

```
  ← { type: "push", text: "¡Ey! Encontré algo interesante." }
  → speech-bubble muestra el texto
  → TTS reproduce el mensaje
```

### Audio TTS del server

```
  ← { type: "audio", audio: "base64...", format: "mp3" }
  → AudioContext.decodeAudioData → AudioBufferSourceNode → reproduce
```

## Modo offline

Si `offlineQueueEnabled` es `true` y la conexión se pierde:

1. Los mensajes del usuario se encolan localmente
2. Se emite `server:queued` con `{ text, queueSize }`
3. Al reconectar, la cola se envía automáticamente
4. Máximo de reintentos configurado en `offlineMaxRetries` (default: 5)
5. Se emite `server:offline` con `true` al perder conexión y `false` al reconectar

## Eventos del EventBus

Todos los eventos de conexión se emiten en el EventBus para que otros módulos reaccionen:

- `server:connected` — transporte conectado (WS o DataChannel)
- `server:disconnected` — transporte desconectado
- `server:session` `{ id }` — session ID asignado
- `server:chunk` `{ chunk, accumulated }` — chunk de streaming
- `server:done` `{ text }` — respuesta completa
- `server:busy` `(bool)` — procesando respuesta
- `server:message` `(msg)` — mensaje genérico
- `server:offline` `(bool)` — modo offline
- `server:queued` `{ text, queueSize }` — mensaje encolado
