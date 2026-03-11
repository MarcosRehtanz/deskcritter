# Fase 1 — Detalle técnico

## Objetivo
Monigote visible en pantalla con animaciones básicas e interacción mínima.

## Tareas

### 1. Setup Tauri
- Crear proyecto con `cargo create-tauri-app`
- Configurar ventana: transparent, decorations false, always_on_top
- Verificar que la ventana transparente funciona en Linux

### 2. Sistema de sprites
- Definir formato de sprite sheet (PNG, frames horizontales)
- Loader de sprite sheets en JS
- Clase `SpriteAnimator` con:
  - play(animationName)
  - update(deltaTime)
  - draw(context)

### 3. Máquina de estados
- Estados iniciales: `idle`, `blink`, `look_around`, `breathe`, `drag`
- Transiciones automáticas por temporizador
- Transiciones por input del usuario (click → drag)

### 4. Seguimiento de cursor
- Calcular ángulo entre monigote y cursor
- Cambiar sprite/dirección de mirada según posición del cursor
- Zona muerta para evitar movimiento constante

### 5. Drag & drop
- mousedown sobre sprite → iniciar drag
- mousemove → mover ventana Tauri (invoke desde JS al backend Rust)
- mouseup → soltar, volver a idle

## Assets necesarios (placeholder)
- Sprite sheet idle (4-6 frames)
- Sprite sheet blink (3 frames)
- Sprite sheet look left/right (2 frames)
