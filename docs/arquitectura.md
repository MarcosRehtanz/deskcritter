# Arquitectura

## Visión general
App de escritorio con Tauri que renderiza un monigote pixel art en una ventana transparente sin bordes. El monigote vive sobre el escritorio del usuario como compañero interactivo.

## Componentes

### Ventana Tauri
- Transparente, sin bordes (decorations: false)
- Always on top
- Click-through en áreas vacías
- Tamaño adaptable al sprite

### Motor de animación (Canvas 2D)
- Sprite sheet loader
- Sistema de estados (idle, walking, dragging, sleeping, etc.)
- Loop de animación con requestAnimationFrame
- Frame rate independiente del refresh rate

### Sistema de comportamiento
- Máquina de estados finita para transiciones entre comportamientos
- Temporizadores para acciones aleatorias (bostezar, mirar, etc.)
- Detección de posición del cursor relativa al monigote

### Sistema de input
- Detección de hover/click sobre el monigote
- Drag & drop nativo
- Eventos del mouse para seguimiento de cursor
