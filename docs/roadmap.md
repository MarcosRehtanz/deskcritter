# Roadmap

## Fase 1 — Base funcional ✅

- [x] Inicializar proyecto Tauri 2
- [x] Ventana transparente sin bordes, always on top
- [x] Cargar y renderizar sprite en Canvas 2D
- [x] Idle animations (parpadeo, respiración, mirar alrededor)
- [x] Seguimiento del cursor
- [x] Drag & drop del monigote

## Fase 2 — Movimiento y físicas ✅

- [x] Físicas básicas (gravedad, colisión con bordes de pantalla)
- [x] Caminar por el escritorio (walk_left, walk_right)
- [x] Rebote al caer (`bounceFactor`, `bounceThreshold`)
- [x] Velocidad terminal configurable
- [x] Multi-monitor support

## Fase 3 — IA conversacional ✅

- [x] Conexión WebSocket a terminal-live
- [x] Streaming de respuestas (chunks)
- [x] Burbuja de texto con streaming
- [x] Botones inline
- [x] Historial de chat persistido en SQLite
- [x] Reconexión automática con backoff exponencial

## Fase 4 — Audio y voz ✅

- [x] Whisper STT local (WASM vía CDN, modelos base/tiny)
- [x] Captura de audio (MediaRecorder + AudioContext)
- [x] Push-to-talk y toggle mode
- [x] Gestión de memoria (RAM check, fallback chain, idle unload)
- [x] TTS browser (Web Speech API)
- [x] TTS server (audio streaming base64)
- [x] Envío de audio al server para transcripción remota

## Fase 5 — Control remoto del PC ✅

- [x] Sistema de tools (action handler + TOOL_MAP)
- [x] Tools: bash, file_read/write/edit/list, grep, screenshot, screen_info
- [x] Tools: clipboard_read/write, git_status/log/diff, process_list/kill
- [x] Flujo completo: action → invoke → Rust → resultado → action_result
- [x] MCP Server standalone (Node.js, stdio, mismos tools)

## Fase 6 — Conectividad avanzada ✅

- [x] Conexión P2P vía nodriza (WebRTC, señalización WebSocket)
- [x] Transporte dual intercambiable (WebSocket directo vs P2P)
- [x] API HTTP local (tiny_http, autenticación Bearer, endpoints REST)
- [x] Mensajes proactivos (push) del server
- [x] Cola offline con reintentos
- [x] Webhooks

## Fase 7 — Personalización ✅

- [x] Panel de configuración completo (ventana separada)
- [x] Estados emocionales (happy, sad, thinking, celebrating)
- [x] Sprite sheets custom (data URL en SQLite)
- [x] Personajes intercambiables
- [x] Efectos de sonido configurables (sfx)
- [x] Atajos globales de teclado (Ctrl+Shift+letra)
- [x] Icono en bandeja del sistema (tray)
- [x] Sistema de plugins (manifiestos + init scripts + API limitada)
- [x] Sistema de debug con logs a archivo

---

## Pendiente

### Mejoras de comportamiento
- [ ] Sentarse en bordes de ventanas
- [ ] Ciclo día/noche según hora del sistema
- [ ] Mini-juegos (piedra/papel/tijera, atrapar objetos)
- [ ] Sistema de alimentación

### Mejoras de personalización
- [ ] Personalización visual (accesorios, colores)
- [ ] Más animaciones emocionales con sprites dedicados

### Integración con sistema
- [ ] Notificaciones y recordatorios nativos
- [ ] Info del clima
- [ ] Reacción a eventos del sistema (batería baja, hora, etc.)

### Multiplataforma
- [ ] Abstraer APIs de sistema en capa de compatibilidad
- [ ] Sistema de input genérico (mouse en desktop, touch en mobile)
- [ ] Setup de Tauri mobile (Android + iOS)
- [ ] Widget de escritorio móvil (Android/iOS)
- [ ] Live Wallpaper (Android)
