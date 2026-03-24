# deskcritter — Monigote Compañero de Escritorio

## Stack
- **Frontend:** HTML / JS / Canvas 2D
- **Backend:** Rust (Tauri 2) + sysinfo (RAM check)
- **STT:** @huggingface/transformers (Whisper ONNX q8, WASM) via CDN
- **Server:** terminal-live (WebSocket + REST)
- **Assets:** Pixel art (sprites frame a frame)

## Arquitectura (thin client para terminal-live)
```
main.js (orquestador)
  ├── event-bus.js          ← pub/sub entre módulos (on/off/once/emit)
  ├── window-manager.js     ← abstracción API Tauri (ventana/monitor/multi-monitor)
  ├── input-handler.js      ← drag & drop + cursor + contextmenu → emite eventos
  ├── pet-behavior.js       ← config FSM + animaciones + transiciones + emociones
  ├── physics.js            ← gravedad, colisiones, multi-monitor bounds
  ├── sprite.js             ← carga y renderizado de sprites (skip frame optimization)
  ├── state-machine.js      ← FSM genérica con pesos
  ├── server-connection.js  ← WebSocket directo a terminal-live (sesión AI + offline queue)
  ├── nodriza-client.js     ← conexión P2P vía nodriza (señalización + WebRTC)
  ├── speech-bubble.js      ← burbuja HTML con streaming de texto
  ├── audio-capture.js      ← MediaRecorder + Whisper local (STT)
  ├── transcriber.js        ← pipeline Whisper WASM (singleton, fallback, idle unload)
  ├── config.js             ← persistencia de config (SQLite)
  ├── config-panel.js       ← panel lateral de configuración (aside derecho)
  ├── action-handler.js     ← dispatcher de acciones remotas (terminal-live → tools)
  ├── sfx.js                ← efectos de sonido sintetizados (AudioContext)
  ├── plugin-loader.js      ← cargador de plugins (manifiestos + init scripts)
  └── tools/                ← wrappers JS → Tauri invoke
      ├── index.js          (registro TOOL_MAP)
      ├── bash.js           (cu_bash)
      ├── files.js          (cu_file_read/write/edit/list)
      ├── grep.js           (cu_grep)
      ├── screen.js         (cu_screenshot, cu_screen_info)
      ├── clipboard.js      (cu_clipboard_read/write)
      ├── git.js            (cu_git_status/log/diff)
      └── process.js        (cu_process_list/kill)
```

## Estructura del proyecto
```
deskcritter/
├── docs/              # Documentación del proyecto
├── src-tauri/         # Backend Rust (Tauri)
│   └── src/
│       ├── main.rs    # Entry point
│       ├── lib.rs     # Setup Tauri + invoke handler
│       ├── commands.rs # Comando get_free_memory_mb
│       └── tools/     # Comandos Tauri para control del PC
│           ├── mod.rs
│           ├── bash.rs      (cu_bash)
│           ├── files.rs     (cu_file_read/write/edit/list)
│           ├── grep.rs      (cu_grep)
│           ├── screen.rs    (cu_screenshot, cu_screen_info)
│           ├── clipboard.rs (cu_clipboard_read/write)
│           ├── git.rs       (cu_git_status/log/diff)
│           └── process.rs   (cu_process_list/kill)
│       └── http_api.rs  # Servidor HTTP local (tiny_http, puerto 17842)
├── src/               # Frontend (HTML/JS/Canvas)
│   ├── assets/        # Sprites y recursos gráficos
│   ├── js/            # Módulos del monigote
│   └── index.html     # Entrada principal
├── mcp-server/        # MCP Server standalone (Node.js, stdio)
│   ├── index.js       # Entry point MCP
│   └── tools/         # Mismos tools como MCP tools
├── CLAUDE.md          # Este archivo
└── README.md          # (no crear a menos que se pida)
```

## Convenciones
- Código y comentarios en español
- Nombres de variables/funciones en inglés
- Commits en español

## Protocolo con terminal-live

### Transporte dual

`main.js` elige el transporte en `init()` según config:
- **WebSocket directo** (`ServerConnection`) — si nodriza está deshabilitada
- **P2P vía nodriza** (`NodrizaClient`) — si nodriza está habilitada con ID + API key

Ambos transportes emiten los mismos eventos en el EventBus (`server:connected`, `server:chunk`, etc.), son intercambiables.

### Conexión WebSocket directa
```
ws://host:3001/
→ { type: "init", sessionType: "ai", provider: "...", agentKey: "..." }
← { type: "session_id", id: "uuid" }
```

### Conexión P2P vía nodriza
```
1. WebSocket a nodriza /signaling
2. Auth: { event: "auth", data: { id, apiKey, role: "client" } }
3. Esperar peer:connected del server emparejado
4. Recibir signal:offer → crear RTCPeerConnection + answer
5. Intercambiar ICE candidates
6. DataChannel abierto → enviar init (mismo JSON que WebSocket)
```

Usa `RTCPeerConnection` nativo del browser (Tauri WebView = Chromium). Sin dependencias extra.

### Mensajes (igual en ambos transportes)
```
→ { type: "input", data: "texto del usuario" }
← { type: "output", data: "chunk" }  (streaming, múltiples)
← { type: "exit" }  (fin del stream)
← { type: "buttons", buttons: [{text, callback_data}] }  (botones inline)
→ { type: "callback", data: "callback_data" }  (click en botón)
→ { type: "voice", audio: base64 }  (audio grabado para transcripción)
← { type: "audio", audio: base64, format: "mp3" }  (TTS del server)
← { type: "action", id, tool, args }  (ejecución remota de tool)
→ { type: "action_result", id, result }  (resultado de ejecución)
→ { type: "action_error", id, error }  (error de ejecución)
```

## Protocolo action (control remoto del PC)

terminal-live envía `{ type: "action", id, tool, args }` y deskcritter responde con `action_result` o `action_error`.

### Tools disponibles

| Tool | Args | Resultado |
|------|------|-----------|
| `bash` | `command, cwd?, timeout_ms?` | `{ stdout, stderr, exit_code }` |
| `file_read` | `path, offset?, limit?` | `{ content }` |
| `file_write` | `path, content` | `{}` |
| `file_edit` | `path, old_string, new_string` | `{}` |
| `file_list` | `path, pattern?` | `{ entries: [{name, is_dir, size}] }` |
| `grep` | `pattern, path?, glob?, max_results?` | `{ matches: [{file, line_number, text}] }` |
| `screenshot` | `x?, y?, w?, h?` | `{ image (base64), width, height }` |
| `clipboard_read` | — | `{ text }` |
| `clipboard_write` | `text` | `{}` |
| `screen_info` | — | `{ width, height, scale_factor }` |
| `git_status` | `cwd?` | `{ output, exit_code }` |
| `git_log` | `cwd?, max_count?, format?` | `{ output, exit_code }` |
| `git_diff` | `cwd?, cached?, ref1?, ref2?` | `{ output, exit_code }` |
| `process_list` | `filter?, max_results?` | `{ processes: [{pid, name, cpu_usage, memory_mb}], total }` |
| `process_kill` | `pid` | `boolean` |

### Flujo
```
terminal-live → { type: "action", id: "uuid", tool: "bash", args: { command: "dir" } }
  → deskcritter action-handler.js → TOOL_MAP["bash"] → invoke("cu_bash", args)
  → Rust tools/bash.rs → PowerShell → resultado
deskcritter → { type: "action_result", id: "uuid", result: { stdout, stderr, exit_code } }
```

### Extensibilidad
Para agregar un tool nuevo:
1. Rust: crear `src-tauri/src/tools/nuevo.rs` + registrar en `mod.rs` + `lib.rs`
2. JS: crear `src/js/tools/nuevo.js` + agregar spread en `tools/index.js`
3. MCP: crear `mcp-server/tools/nuevo.js` + registrar en `index.js`

El dispatcher (`action-handler.js`) no se modifica — solo el registro.

## MCP Server standalone

Server MCP para que terminal-live acceda a los mismos tools sin deskcritter corriendo.

```json
{
  "mcpServers": {
    "deskcritter": {
      "command": "node",
      "args": ["C:/Users/padil/Documents/wsl/deskcritter/mcp-server/index.js"]
    }
  }
}
```

### Config HTTP
```
GET /api/providers   → lista de providers disponibles
GET /api/agents      → lista de agentes
```

## Configuración de nodriza

En el panel de config (Conexión), toggle "Usar Nodriza (P2P)":
- **URL de Nodriza** — `ws://localhost:3000/signaling`
- **Client ID** — ID del client creado en el dashboard de nodriza
- **API Key** — API key obtenida al crear el client

Cuando nodriza está activo, los campos de conexión directa (Server URL) se desactivan.

Config keys en SQLite:
```
nodrizaEnabled   — boolean (default: false)
nodrizaUrl       — string  (default: ws://localhost:3000/signaling)
nodrizaClientId  — string
nodrizaApiKey    — string
ttsEnabled       — boolean (default: true)
ttsProvider      — string  (default: "browser")
whisperModel     — string  (default: "small")
whisperEnabled   — boolean (default: true)
emotionsEnabled  — boolean (default: true)
emotionHappyMs   — number  (default: 2000)
connBadgeEnabled — boolean (default: true)
sfxEnabled       — boolean (default: true)
sfxVolume        — number  (default: 0.5)
sfxChat/sfxMessage/sfxMic/sfxConnect/sfxError — boolean (default: true)
contextMenuEnabled — boolean (default: true)
chatHistoryEnabled — boolean (default: true)
chatHistoryMax   — number  (default: 0, sin límite)
notificationsEnabled — boolean (default: false)
localApiEnabled  — boolean (default: false)
localApiPort     — number  (default: 17842)
offlineQueueEnabled — boolean (default: true)
offlineMaxRetries — number (default: 5)
pluginsEnabled   — boolean (default: false)
pluginsDir       — string  (default: "plugins/")
autoUpdateEnabled — boolean (default: true)
```

## TTS (Text-to-Speech)

### Browser Speech (local)
- Usa `window.speechSynthesis` nativo del WebView (Chromium)
- Sin dependencias, funciona offline
- Voces dependen del sistema operativo

### Server TTS (remoto)
- El server envía `{ type: "audio", audio: base64, format: "mp3" }` por P2P/WebSocket
- Se reproduce con `AudioContext.decodeAudioData` + `AudioBufferSourceNode`
- Proveedores disponibles en el server: Edge TTS, Piper, ElevenLabs, OpenAI, Google

## Whisper STT local

### Modelos (chain de fallback)
- `Xenova/whisper-small` (1.4GB) → `base` (800MB) → `tiny` (600MB)
- Límite: 2GB máx. Medium excluido.
- Import via CDN: `https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1`

### Flujo
```
mic button → MediaRecorder → Blob → AudioContext.decodeAudioData
→ Float32 PCM 16kHz → transcriber.transcribe() → Whisper WASM
→ texto → eventBus 'audio:result' → server.send()
```

### Startup
1. `predownload()` — descarga small + base al Cache API (no carga en RAM)
2. `preload()` — carga en RAM el modelo que entre según RAM libre
3. RAM check via Rust: `invoke('get_free_memory_mb')` (sysinfo crate)
4. Idle unload: 5 min sin uso → descarga de RAM

## Eventos del bus (event-bus.js)

### Input
- `input:dragStart` — el usuario empezó a arrastrar
- `input:dragMove` { deltaX, deltaY } — movimiento durante drag
- `input:dragEnd` — el usuario soltó
- `input:cursorMove` { mouseX, centerX } — movimiento del cursor

### Server (emitidos por ServerConnection o NodrizaClient)
- `server:connected` — transporte conectado (WebSocket o DataChannel P2P)
- `server:disconnected` — transporte desconectado
- `server:session` { id } — session ID asignado
- `server:chunk` { chunk, accumulated } — chunk de streaming
- `server:done` { text } — respuesta completa
- `server:busy` (bool) — procesando respuesta
- `server:message` (msg) — mensaje genérico del server

### Audio
- `audio:result` { text } — texto transcrito por Whisper
- `audio:started` — grabando
- `audio:stopped` — dejó de grabar
- `audio:transcribing` — procesando audio con Whisper
- `audio:error` { error } — error de audio/transcripción

### Transcriber
- `transcriber:loading` { model } — cargando modelo en RAM
- `transcriber:loaded` { model } — modelo listo
- `transcriber:unloaded` { model } — modelo descargado (idle)
- `transcriber:downloading` { model } — descargando al cache
- `transcriber:download-progress` { model, progress } — progreso descarga
- `transcriber:downloaded` { model } — descarga completa
- `transcriber:fallback` { from, to } — fallback por memoria
- `transcriber:error` { error } — error del transcriber

### Burbuja
- `bubble:show` — burbuja visible
- `bubble:hide` — burbuja oculta

### Action (control remoto)
- `action:request` { id, tool, args } — acción remota del server

### Menú contextual
- `input:contextMenu` { x, y } — click derecho sobre el critter

### Server (offline)
- `server:offline` (bool) — modo offline activado/desactivado
- `server:queued` { text, queueSize } — mensaje encolado (offline)

### Config
- `config:open` — abrir panel de configuración

### HTTP API (emitidos desde Rust)
- `http-api:message` { text } — mensaje recibido via HTTP
- `http-api:action` { action } — acción recibida via HTTP
- `http-api:webhook` { event, data } — webhook recibido via HTTP

### Tray
- `tray:reconnect` — reconectar desde el tray
