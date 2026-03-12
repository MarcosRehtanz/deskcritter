# Fase 1 — Detalle técnico

## Objetivo
Monigote visible en pantalla con animaciones básicas e interacción mínima.

## Tareas

### 1. Setup Tauri ✅
- Crear proyecto con `cargo create-tauri-app`
- Configurar ventana: transparent, decorations false, always_on_top
- `withGlobalTauri: true` habilitado para acceder a la API sin bundler

### 2. Sistema de sprites ✅ (parcial)
- Definir formato de sprite sheet (PNG, frames horizontales)
- Loader de sprite sheets en JS (`SpriteAnimator` en `src/js/sprite.js`)
- Clase `SpriteAnimator` con:
  - play(animationName)
  - update(deltaTime)
  - draw(context)
- **Pendiente:** sprite sheet real (`assets/critter.png`), actualmente usa placeholder dibujado con Canvas

### 3. Máquina de estados ✅
- Estados implementados: `idle`, `blink`, `look_left`, `look_right`, `drag`
- Transiciones automáticas por temporizador con pesos aleatorios
- Transiciones por input del usuario (click → drag)
- Implementada en `src/js/state-machine.js`

### 4. Seguimiento de cursor ✅
- Detecta posición del mouse relativa al canvas
- Cambia a `look_left` o `look_right` según posición del cursor
- Zona muerta (threshold de 40px) para evitar movimiento constante

### 5. Drag & drop ✅
- mousedown sobre canvas → iniciar drag
- mousemove → mover ventana Tauri vía `window.__TAURI__.window`
- mouseup → soltar, volver a idle
- Permisos configurados: `core:window:allow-set-position`, `core:window:allow-outer-position`

## Notas técnicas
- Sin bundler: el frontend se sirve como archivos estáticos desde `src/`
- Se usa `window.__TAURI__` (global) en lugar de imports de `@tauri-apps/api`
- El paquete `@tauri-apps/api` está instalado pero no se usa directamente (no hay bundler que lo resuelva)

## Assets necesarios (placeholder)
- Sprite sheet idle (4-6 frames)
- Sprite sheet blink (3 frames)
- Sprite sheet look left/right (2 frames)
