# Diseño del personaje

## Estilo
- Pixel art puro, sin anti-aliasing
- Tamaño por frame: 32×32 píxeles
- Paleta de colores limitada (8-16 colores)
- Escalado ×3 para visibilidad en pantalla (`spriteScale: 3`)
- Fondo completamente transparente (canal alfa)

## Personalidad
- Curioso y amigable
- Reacciona al usuario con gestos simples
- No invasivo (no bloquea el trabajo)
- Expresa emociones según el contexto de la conversación

## Sprite sheet

El sprite sheet es una imagen PNG con animaciones organizadas en filas horizontales. Cada fila contiene los frames de una animación, de izquierda a derecha.

Archivo: `src/assets/critter.png`

### Animaciones base (filas 0-4, requeridas)

| Fila | Animación | Frames | FPS (ms/frame) | Descripción |
|------|-----------|--------|----------------|-------------|
| 0 | `idle` | 4 | 300 | Respiración suave, movimiento sutil |
| 1 | `blink` | 3 | 150 | Cierre y apertura de ojos |
| 2 | `look_left` | 2 | 250 | Mira a la izquierda |
| 3 | `look_right` | 2 | 250 | Mira a la derecha |
| 4 | `drag` | 2 | 200 | Expresión de sorpresa al ser arrastrado |

### Animaciones opcionales (filas 5+)

Si el sprite sheet tiene más de 5 filas, se registran automáticamente:

| Fila | Animación | FPS (ms/frame) | Descripción |
|------|-----------|----------------|-------------|
| 5 | `sleep` | 400 | Dormido |
| 6 | `wave` | 150 | Saludo |
| 7 | `celebrate` | 150 | Celebración |
| 8 | `think` | 150 | Pensando |
| 9 | `sad` | 600 | Triste |

### Animaciones con fallback

Si las filas opcionales no existen, se usan fallbacks sobre las filas base:

| Animación | Fallback | FPS |
|-----------|----------|-----|
| `think` | fila 1 (blink) | 150 ms |
| `happy` | fila 0 (idle rápido) | 100 ms |
| `sad` | fila 0 (idle lento) | 600 ms |
| `celebrate` | fila 0 (idle muy rápido) | 80 ms |

## Estados FSM

El monigote usa una máquina de estados finita con transiciones probabilísticas:

### Estados autónomos (ciclo normal)

| Estado | Animación | Duración | Transiciones |
|--------|-----------|----------|-------------|
| `idle` | idle | 2–5s | blink(4), look_left(2), look_right(2), walk_left(1), walk_right(1) |
| `blink` | blink | 0.4–0.6s | idle(10) |
| `look_left` | look_left | 1–2.5s | idle(6), blink(3), look_right(1) |
| `look_right` | look_right | 1–2.5s | idle(6), blink(3), look_left(1) |
| `walk_left` | look_left | 2–5s | idle(5), walk_right(1) |
| `walk_right` | look_right | 2–5s | idle(5), walk_left(1) |

Los números entre paréntesis son pesos de probabilidad.

### Estados de interacción

| Estado | Animación | Duración | Trigger |
|--------|-----------|----------|---------|
| `drag` | drag | indefinida | usuario arrastra el monigote |
| `fall` | drag | indefinida | en caída libre |

### Estados emocionales

| Estado | Animación | Duración | Trigger |
|--------|-----------|----------|---------|
| `thinking` | think | indefinida | server procesando |
| `happy` | happy | 2s (configurable) | respuesta positiva |
| `sad` | sad | indefinida | respuesta negativa |
| `celebrating` | celebrate | 2s | evento especial |

## Personajes custom

Los usuarios pueden cargar sprite sheets alternativos:
- Se almacenan como data URL en la tabla `characters` de SQLite
- Se soportan múltiples personajes, uno activo a la vez
- El sprite sheet custom debe seguir la misma estructura de filas

## Pendiente
- [ ] Definir diseño final del personaje
- [ ] Crear sprites dedicados para filas opcionales (5-9)
- [ ] Agregar más animaciones emocionales
