# Arquitectura

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework de escritorio | [Tauri 2](https://v2.tauri.app/) (Rust + WebView) |
| Frontend | HTML / JavaScript / Canvas 2D (sin bundler) |
| Backend | Rust (sysinfo, xcap, arboard, tiny_http, tokio) |
| Base de datos | SQLite vía `tauri-plugin-sql` |
| STT (Speech-to-Text) | Whisper ONNX (q8) vía `@huggingface/transformers` (WASM, CDN) |
| TTS (Text-to-Speech) | Web Speech API (local) + audio streaming del server |
| Servidor IA | [terminal-live](https://github.com/MarcosRehtanz/terminal-live) (WebSocket + REST) |
| Señalización P2P | [nodriza](https://github.com/MarcosRehtanz/nodriza) (WebRTC vía WebSocket) |
| Assets | Pixel art 32×32, sprite sheets frame a frame |

## Estructura del proyecto

```
deskcritter/
├── src-tauri/               # Backend Rust (Tauri)
│   ├── src/
│   │   ├── main.rs          # Entry point
│   │   ├── lib.rs           # Setup Tauri: plugins, tray, invoke handler
│   │   ├── commands.rs      # Comandos generales (RAM, debug, shortcuts, HTTP API)
│   │   ├── http_api.rs      # Servidor HTTP local (tiny_http)
│   │   └── tools/           # Comandos Tauri para control del PC
│   │       ├── mod.rs
│   │       ├── bash.rs
│   │       ├── files.rs
│   │       ├── grep.rs
│   │       ├── screen.rs
│   │       ├── clipboard.rs
│   │       ├── git.rs
│   │       └── process.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/               # Íconos de la app
├── src/                     # Frontend (HTML/JS/Canvas)
│   ├── index.html           # Ventana principal (monigote)
│   ├── config.html          # Ventana de configuración
│   ├── assets/              # Sprites y recursos gráficos
│   └── js/                  # Módulos JavaScript
│       ├── main.js          # Orquestador principal
│       ├── event-bus.js     # Pub/sub entre módulos
│       ├── config.js        # Persistencia de configuración
│       ├── db.js            # Acceso a SQLite
│       ├── debug.js         # Sistema de debug
│       ├── window-manager.js
│       ├── input-handler.js
│       ├── pet-behavior.js
│       ├── physics.js
│       ├── sprite.js
│       ├── state-machine.js
│       ├── server-connection.js
│       ├── nodriza-client.js
│       ├── speech-bubble.js
│       ├── audio-capture.js
│       ├── transcriber.js
│       ├── action-handler.js
│       ├── plugin-loader.js
│       ├── text-utils.js
│       ├── config-panel-app.js
│       └── tools/           # Wrappers JS → Tauri invoke
│           ├── index.js
│           ├── bash.js
│           ├── files.js
│           ├── grep.js
│           ├── screen.js
│           ├── clipboard.js
│           ├── git.js
│           └── process.js
├── mcp-server/              # MCP Server standalone (Node.js, stdio)
│   ├── index.js
│   ├── package.json
│   └── tools/               # Mismos tools como MCP tools
├── docs/                    # Documentación
├── CLAUDE.md                # Referencia rápida para asistentes de código
└── package.json
```

## Diagrama de módulos

```
main.js (orquestador)
  ├── event-bus.js          ← pub/sub central entre todos los módulos
  ├── config.js             ← cache de config (SQLite via db.js)
  ├── window-manager.js     ← API Tauri: ventana, monitor, multi-monitor
  ├── input-handler.js      ← drag & drop, cursor, menú contextual → eventos
  ├── pet-behavior.js       ← configuración FSM + animaciones + emociones
  ├── physics.js            ← gravedad, colisiones, multi-monitor bounds
  ├── sprite.js             ← carga y renderizado de sprites (skip frame opt)
  ├── state-machine.js      ← FSM genérica con pesos probabilísticos
  ├── server-connection.js  ← WebSocket directo a terminal-live
  ├── nodriza-client.js     ← P2P vía nodriza (señalización + WebRTC)
  ├── speech-bubble.js      ← burbuja HTML con streaming de texto
  ├── audio-capture.js      ← MediaRecorder + envío a Whisper local
  ├── transcriber.js        ← pipeline Whisper WASM (singleton, fallback, idle unload)
  ├── action-handler.js     ← dispatcher de acciones remotas → TOOL_MAP
  ├── plugin-loader.js      ← manifiestos + init scripts de plugins
  ├── text-utils.js         ← utilidades de procesamiento de texto
  └── tools/                ← wrappers JS → Tauri invoke
```

## Flujo de datos principal

### Inicialización

```
index.html
  → main.js init()
    → config.init()          (carga SQLite → cache en memoria)
    → window-manager.init()  (detecta monitores, dimensiona ventana)
    → sprite.load()          (carga sprite sheet, registra animaciones)
    → state-machine.init()   (registra estados FSM)
    → pet-behavior.setup()   (conecta animaciones con estados)
    → physics.init()         (calcula bounds de pantalla)
    → input-handler.init()   (registra listeners de mouse)
    → server-connection.connect() ó nodriza-client.connect()
    → transcriber.predownload() (descarga modelos al Cache API)
    → plugin-loader.loadPlugins()
    → gameLoop()             (requestAnimationFrame)
```

### Game loop

```
gameLoop(timestamp)
  → physics.update(dt)          # gravedad, velocidad, colisiones
  → sprite.update(dt)           # avance de frames de animación
  → state-machine.update(dt)    # transiciones automáticas por timer
  → sprite.render(ctx)          # dibuja frame actual en Canvas
  → requestAnimationFrame(gameLoop)
```

### Flujo de conversación

```
Usuario habla / escribe
  → audio-capture → transcriber → texto
  → server-connection.send({ type: "input", data: texto })
  ← server: { type: "output", data: chunk }  (streaming, múltiples)
  → speech-bubble.appendChunk(chunk)
  → TTS reproduce el texto
  ← server: { type: "exit" }  (fin del stream)
```

## Patrón event-driven

El `EventBus` es el hub central de comunicación. Todos los módulos se comunican a través de eventos tipados, sin dependencias directas entre sí.

```
[input-handler]  ──emit──→  [EventBus]  ──notify──→  [physics]
[server-conn]    ──emit──→  [EventBus]  ──notify──→  [speech-bubble]
[audio-capture]  ──emit──→  [EventBus]  ──notify──→  [transcriber]
[action-handler] ──emit──→  [EventBus]  ──notify──→  [tools/*]
```

Categorías de eventos:
- **Input:** `input:dragStart`, `input:dragMove`, `input:dragEnd`, `input:cursorMove`, `input:contextMenu`
- **Server:** `server:connected`, `server:disconnected`, `server:session`, `server:chunk`, `server:done`, `server:busy`, `server:message`, `server:offline`, `server:queued`
- **Audio:** `audio:result`, `audio:started`, `audio:stopped`, `audio:transcribing`, `audio:error`
- **Transcriber:** `transcriber:loading`, `transcriber:loaded`, `transcriber:unloaded`, `transcriber:downloading`, `transcriber:download-progress`, `transcriber:downloaded`, `transcriber:fallback`, `transcriber:error`
- **Burbuja:** `bubble:show`, `bubble:hide`
- **Acciones:** `action:request`
- **Config:** `config:open`
- **HTTP API:** `http-api:message`, `http-api:action`, `http-api:webhook`
- **Tray:** `tray:reconnect`

## Transporte dual

`main.js` elige el transporte según la configuración:

| Modo | Clase | Cuándo |
|------|-------|--------|
| WebSocket directo | `ServerConnection` | `nodrizaClientId` vacío (default) |
| P2P vía nodriza | `NodrizaClient` | `nodrizaClientId` + `nodrizaApiKey` configurados |

Ambos transportes emiten los mismos eventos en el EventBus y son intercambiables. Ver [Protocolo](protocolo.md) para detalles.

## Capas de la aplicación

```
┌─────────────────────────────────────────┐
│  Frontend (JS)                          │
│  Canvas 2D, EventBus, FSM, UI          │
├─────────────────────────────────────────┤
│  Bridge (Tauri invoke)                  │
│  window.__TAURI__.core.invoke()         │
├─────────────────────────────────────────┤
│  Backend (Rust)                         │
│  sysinfo, xcap, arboard, tokio, shell  │
├─────────────────────────────────────────┤
│  Sistema operativo                      │
│  Filesystem, procesos, clipboard, etc.  │
└─────────────────────────────────────────┘
```

## Base de datos SQLite

Archivo: `deskcritter.db` (en el directorio de datos de la app)

### Tablas

**config** — Configuración clave-valor (valores serializados como JSON)
```sql
CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**characters** — Personajes (sprite sheets custom)
```sql
CREATE TABLE characters (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  sprite    TEXT NOT NULL,       -- data URL del sprite sheet
  is_active INTEGER DEFAULT 0   -- 1 = personaje activo
);
```

**messages** — Historial de chat
```sql
CREATE TABLE messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role       TEXT NOT NULL,      -- 'user' o 'assistant'
  text       TEXT NOT NULL,
  timestamp  INTEGER NOT NULL    -- epoch ms
);
```

Las migraciones se ejecutan automáticamente al arrancar vía `tauri-plugin-sql`.

## Icono de bandeja (system tray)

El icono en la bandeja del sistema ofrece:
- **Configuración** — abre la ventana de config (`config.html`)
- **Reconectar** — emite `tray:reconnect` al frontend
- **Ocultar/Mostrar** — toggle de visibilidad de la ventana principal
- **Salir** — cierra la app

## Atajos globales

Se registran atajos `Ctrl+Shift+<letra>` desde JavaScript via el comando `register_shortcuts`. Cuando se presiona un atajo, el backend emite un evento `global-shortcut` con `{ key, state }` al frontend.
