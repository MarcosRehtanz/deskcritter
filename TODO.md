# DeskCritter - Pendiente de implementar

## Funcionalidad existente
- Desktop pet con Tauri 2 + Canvas 2D
- Máquina de estados finita con animaciones por sprites
- Física: gravedad, colisiones, arrastre
- Conexión WebSocket a terminal-live
- Speech-to-text local con Whisper WASM
- Panel de configuración
- Persistencia en SQLite (Tauri plugin)

## Pendiente

### Integración con Nodriza
- [x] **Modo client P2P** — `nodriza-client.js` conecta a nodriza como "client"
  - Señalización WebSocket a nodriza → WebRTC P2P con terminal-live
  - Usa RTCPeerConnection nativo del browser (Tauri WebView)
  - DataChannel transporta el mismo protocolo JSON que WebSocket directo
  - Mismo contrato de eventos EventBus que ServerConnection (intercambiable)
- [x] **Configuración de nodriza** — toggle + campos en panel de config (Conexión)
  - URL, Client ID, API Key
  - Al activar nodriza, los campos de conexión directa se desactivan
- [x] **Fallback** — si nodriza está deshabilitada, usa WebSocket directo (ServerConnection)
- [x] **Re-conexión automática** — backoff exponencial (2s → 30s) en signaling y P2P
- [x] **Audio remoto** — envío de audio grabado al server por P2P para transcripción
- [x] **TTS** — reproducción de audio sintetizado recibido del server (browser speech + server TTS)
- [x] **Persistencia de historial de chat** — conversaciones guardadas en SQLite
- [ ] **Indicador de modo** — mostrar en el UI si está conectado vía P2P o WebSocket directo

### Mascota / UI
- [ ] **Más sprites/personajes** — la tabla `characters` existe pero solo hay uno
- [ ] **Emociones** — estados de ánimo que cambian según la interacción
- [ ] **Notificaciones** — la mascota puede mostrar notificaciones del sistema
- [ ] **Interacciones** — más formas de interactuar (click derecho menú, gestos)
- [ ] **Sonidos** — efectos de sonido para acciones de la mascota
- [ ] **Multi-monitor** — la mascota debería poder moverse entre monitores

### Audio / AI
- [ ] **Modo offline** — funcionar sin conexión al server (comportamiento autónomo)
- [ ] **Selección de modelo Whisper** desde el panel de config (actualmente hardcoded)

### UI / CSS
- [ ] **Unificar CSS burbuja/chat** — los botones de burbuja y chat usan estilos duplicados, extraer a clases compartidas
- [ ] **Extraer lógica de reconexión P2P** — la reconexión con backoff está inline en nodriza-client.js, extraer a módulo reutilizable

### Técnico
- [ ] **Auto-update** — actualizaciones automáticas con Tauri updater
- [ ] **Bandeja del sistema** mejorada — más opciones en el menú de tray
- [ ] **Logs** — sistema de logs visible para debugging
- [ ] **Reducir uso de RAM** — el modelo Whisper consume mucha memoria
