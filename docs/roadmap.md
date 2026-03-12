# Roadmap

## Fase 1 — Base funcional ← ACTUAL
- [x] Inicializar proyecto Tauri
- [ ] Ventana transparente sin bordes, always on top
- [x] Cargar y renderizar sprite en Canvas (placeholder activo, falta sprite sheet real)
- [x] Idle animations (parpadeo, respiración, mirar alrededor)
- [x] Seguimiento del cursor
- [x] Drag & drop del monigote

## Fase 2 — Movimiento libre
- [ ] Físicas básicas (gravedad, colisión con bordes de pantalla)
- [ ] Caminar por el escritorio
- [ ] Sentarse en bordes de ventanas

## Fase 3 — Personalidad
- [ ] Estados de ánimo (feliz, aburrido, curioso, somnoliento)
- [ ] Ciclo día/noche según hora del sistema
- [ ] Transiciones de ánimo basadas en interacción del usuario

## Fase 4 — Interacción avanzada
- [ ] Mini-juegos (piedra/papel/tijera, atrapar objetos)
- [ ] Sistema de alimentación
- [ ] Personalización visual (accesorios, colores)

## Fase 5 — Integración con sistema
- [ ] Notificaciones y recordatorios
- [ ] Info del clima
- [ ] Reacción a eventos del sistema (batería baja, hora, etc.)

## Fase 6 — IA conversacional
- [ ] Globos de texto con diálogos
- [ ] Conexión a API de Claude para conversación
- [ ] Contexto y memoria de interacciones

---

## Fase 7 — Preparación multiplataforma
- [ ] Migrar a Tauri v2 (si no se inició con v2)
- [ ] Abstraer APIs de sistema en capa de compatibilidad
- [ ] Separar lógica core del monigote de la lógica de ventana/escritorio
- [ ] Sistema de input genérico (mouse en desktop, touch en mobile)
- [ ] Tests de renderizado en Canvas para diferentes tamaños de pantalla

## Fase 8 — App mobile standalone
- [ ] Setup de Tauri mobile (Android + iOS)
- [ ] Pantalla completa con fondo personalizable
- [ ] Adaptar interacciones a touch (tap, swipe, hold)
- [ ] Gestos táctiles: acariciar, empujar, hacer cosquillas
- [ ] Ajustar tamaño del sprite a resoluciones móviles
- [ ] Notificaciones push del monigote (recordatorios, saludos)

## Fase 9 — Widget de escritorio móvil
- [ ] Widget Android (Kotlin bridge desde Tauri o nativo)
- [ ] Widget iOS (WidgetKit, requiere Swift nativo)
- [ ] Monigote mini animado en pantalla de inicio
- [ ] Sincronización de estado/ánimo entre app y widget

## Fase 10 — Live Wallpaper (Android)
- [ ] Wallpaper service con Canvas/WebView
- [ ] Monigote caminando por el fondo de pantalla
- [ ] Reacción a toques sobre el wallpaper
- [ ] Optimización de batería (reducir FPS cuando no es visible)
