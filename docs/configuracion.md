# Configuración

Toda la configuración se persiste en SQLite (tabla `config`) y se cachea en memoria al arrancar. El módulo `config.js` expone acceso síncrono vía `get(key)` y escritura asíncrona vía `set({ key: value })`.

## Config keys

### Conexión

| Key | Tipo | Default | Descripción |
|-----|------|---------|-------------|
| `serverUrl` | string | `ws://localhost:3001` | URL del servidor terminal-live |
| `provider` | string | `""` | Proveedor de IA (vacío = usa el del server) |
| `agentKey` | string | `""` | Clave del agente |
| `model` | string | `""` | Modelo de IA (vacío = default del server) |

### Nodriza (P2P)

| Key | Tipo | Default | Descripción |
|-----|------|---------|-------------|
| `nodrizaUrl` | string | `ws://localhost:3000/signaling` | URL del servidor de señalización |
| `nodrizaClientId` | string | `""` | ID del client registrado en nodriza |
| `nodrizaApiKey` | string | `""` | API key del client |

Cuando `nodrizaClientId` y `nodrizaApiKey` están configurados, se usa `NodrizaClient` (P2P) en lugar de `ServerConnection` (WebSocket directo).

### Audio — STT (Whisper)

| Key | Tipo | Default | Descripción |
|-----|------|---------|-------------|
| `audioEnabled` | boolean | `false` | Habilitar captura de audio |
| `audioLang` | string | `es-AR` | Idioma para reconocimiento |
| `whisperModel` | string | `Xenova/whisper-base` | Modelo Whisper a usar |
| `whisperLang` | string | `es` | Idioma para Whisper |
| `whisperPredownload` | boolean | `true` | Pre-descargar modelo al arrancar |
| `whisperLocal` | boolean | `true` | Usar Whisper local (vs. enviar audio al server) |
| `whisperIdleMs` | number | `60000` | Tiempo de inactividad antes de descargar modelo de RAM |
| `whisperMaxRamMb` | number | `2048` | RAM máxima para modelos Whisper |

### Audio — TTS

| Key | Tipo | Default | Descripción |
|-----|------|---------|-------------|
| `ttsEnabled` | boolean | `true` | Habilitar text-to-speech |
| `ttsProvider` | string | `browser` | `"browser"` (Web Speech API) o `"server"` |
| `ttsVoice` | string | `""` | Nombre de voz del sistema (vacío = default) |
| `ttsRate` | number | `1.0` | Velocidad de voz (0.5 – 2.0) |
| `ttsPitch` | number | `1.0` | Tono de voz (0.5 – 2.0) |
| `ttsVolume` | number | `1.0` | Volumen de voz (0.0 – 1.0) |

### Apariencia

| Key | Tipo | Default | Descripción |
|-----|------|---------|-------------|
| `spriteSheet` | string | `""` | Sprite sheet custom (data URL) |
| `spriteScale` | number | `3` | Factor de escala del sprite |
| `bubbleEnabled` | boolean | `true` | Mostrar burbuja de texto |
| `bubbleDismissMs` | number | `12000` | Tiempo antes de ocultar la burbuja |
| `chatWidth` | number | `320` | Ancho de la ventana de chat |
| `chatHeight` | number | `450` | Alto de la ventana de chat |
| `hoverDelayMs` | number | `300` | Delay antes de mostrar hover |
| `connBadgeEnabled` | boolean | `true` | Mostrar badge de estado de conexión |

### Física

| Key | Tipo | Default | Descripción |
|-----|------|---------|-------------|
| `physicsGravity` | number | `1200` | Aceleración gravitatoria (px/s²) |
| `physicsWalkSpeed` | number | `70` | Velocidad de caminata (px/s) |
| `physicsBounceFactor` | number | `0.25` | Factor de rebote al caer |
| `physicsBounceThreshold` | number | `150` | Velocidad mínima para rebotar (px/s) |
| `physicsTerminalVelocity` | number | `900` | Velocidad terminal de caída (px/s) |

### Comportamiento

| Key | Tipo | Default | Descripción |
|-----|------|---------|-------------|
| `behaviorCursorThreshold` | number | `20` | Umbral de distancia del cursor (px) |
| `behaviorIdleMin` / `Max` | number | `2000` / `5000` | Duración de idle (ms) |
| `behaviorBlinkMin` / `Max` | number | `400` / `600` | Duración de parpadeo (ms) |
| `behaviorLookMin` / `Max` | number | `1000` / `2500` | Duración de mirada (ms) |
| `behaviorWalkMin` / `Max` | number | `2000` / `5000` | Duración de caminata (ms) |
| `behaviorWeightBlink` | number | `4` | Peso de transición → blink |
| `behaviorWeightLook` | number | `2` | Peso de transición → look |
| `behaviorWeightWalk` | number | `1` | Peso de transición → walk |
| `behaviorFpsIdle` | number | `300` | ms por frame en idle |
| `behaviorFpsBlink` | number | `150` | ms por frame en blink |
| `behaviorFpsLook` | number | `250` | ms por frame en look |
| `behaviorFpsDrag` | number | `200` | ms por frame en drag |

### Emociones

| Key | Tipo | Default | Descripción |
|-----|------|---------|-------------|
| `emotionsEnabled` | boolean | `true` | Habilitar estados emocionales |
| `emotionHappyMs` | number | `2000` | Duración del estado happy (ms) |

### Efectos de sonido

| Key | Tipo | Default | Descripción |
|-----|------|---------|-------------|
| `sfxEnabled` | boolean | `true` | Habilitar efectos de sonido |
| `sfxVolume` | number | `0.5` | Volumen general (0.0 – 1.0) |
| `sfxChat` | boolean | `true` | Sonido al enviar mensaje |
| `sfxMessage` | boolean | `true` | Sonido al recibir mensaje |
| `sfxMic` | boolean | `true` | Sonido al activar/desactivar mic |
| `sfxConnect` | boolean | `true` | Sonido al conectar/desconectar |
| `sfxError` | boolean | `true` | Sonido en errores |

### Avanzado

| Key | Tipo | Default | Descripción |
|-----|------|---------|-------------|
| `reconnectBaseMs` | number | `1000` | Delay base de reconexión |
| `reconnectMaxMs` | number | `30000` | Delay máximo de reconexión |
| `holdToTalkMs` | number | `400` | Tiempo para activar hold-to-talk (ms) |
| `contextMenuEnabled` | boolean | `true` | Habilitar menú contextual |
| `chatHistoryEnabled` | boolean | `true` | Guardar historial de chat |
| `chatHistoryMax` | number | `0` | Máximo de mensajes (0 = sin límite) |
| `notificationsEnabled` | boolean | `false` | Notificaciones del sistema |
| `localApiEnabled` | boolean | `false` | Habilitar API HTTP local |
| `localApiPort` | number | `17842` | Puerto de la API HTTP local |
| `autoUpdateEnabled` | boolean | `true` | Auto-actualización |
| `offlineQueueEnabled` | boolean | `true` | Encolar mensajes en modo offline |
| `offlineMaxRetries` | number | `5` | Reintentos máximos de la cola offline |
| `pluginsEnabled` | boolean | `false` | Habilitar sistema de plugins |
| `pluginsDir` | string | `plugins/` | Directorio de plugins |

## Panel de configuración

La configuración se gestiona desde una ventana separada (`config.html`), accesible desde:
- El icono de la bandeja del sistema → "Configuración"
- El menú contextual sobre el monigote

La ventana de config (`900×600`, sin decoraciones) agrupa las opciones por categoría y permite modificar cualquier config key en tiempo real. Los cambios se persisten inmediatamente en SQLite.

## Persistencia

- **Almacenamiento:** tabla `config` en `deskcritter.db` (SQLite)
- **Formato:** valores serializados como JSON (`JSON.stringify`)
- **Cache:** al arrancar, toda la config se carga a un objeto en memoria
- **Escritura:** cada `set()` escribe a SQLite y actualiza el cache
- **Reset:** `reset()` restaura todos los valores a los defaults

## Migraciones

Se ejecutan automáticamente migraciones de config en `config.init()`:

1. **Provider vacío:** si `provider` era `"claude-code"` o `"anthropic"`, se migra a `""` (el provider lo maneja el server)
2. **Whisper base:** si `whisperModel` era `"Xenova/whisper-small"`, se migra a `"Xenova/whisper-base"` (más rápido, menos RAM)
