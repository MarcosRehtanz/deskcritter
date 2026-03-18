# Prompt — Generación del primer personaje

## Prompt

```
Diseñá un sprite sheet completo en pixel art para un personaje de mascota virtual de escritorio (desktop pet). El personaje será una pequeña criatura amigable, curiosa y no invasiva que acompaña al usuario mientras trabaja en su computadora.

### Estilo visual
- Pixel art puro, sin anti-aliasing ni suavizado
- Tamaño por frame: exactamente 32×32 píxeles
- Paleta de colores limitada: máximo 12 colores (incluyendo transparencia)
- Estética: adorable, redondeado, expresivo con rasgos mínimos
- Inspiración: Tamagotchi, mascotas de escritorio de los 90s, slimes de RPG clásico
- Fondo: completamente transparente (canal alfa)
- Sin borde exterior (outline) grueso — máximo 1px de contorno si es necesario
- Los ojos son el rasgo más expresivo: grandes en proporción al cuerpo

### Diseño del personaje
- Criatura fantástica pequeña (no un animal real, algo inventado y único)
- Cuerpo compacto y redondeado que quepa cómodamente en 32×32
- Proporciones chibi: cabeza grande, cuerpo pequeño (o solo cabeza con patas)
- Colores sugeridos: tonos verdes/turquesa como color primario, con acentos cálidos
- Debe tener: ojos grandes y expresivos, boca simple, extremidades pequeñas o vestigiales
- Debe transmitir: ternura, compañía, tranquilidad

### Especificaciones técnicas del sprite sheet
El sprite sheet debe ser una imagen PNG única con las animaciones organizadas en filas horizontales. Cada fila contiene los frames de una animación distinta, de izquierda a derecha.

Disposición exacta (filas × columnas):
- **Fila 0 — idle** (4 frames): respiración suave. Movimiento sutil arriba/abajo del cuerpo (1-2px). El personaje está relajado, mirando al frente.
- **Fila 1 — blink** (3 frames): parpadeo. Frame 1: ojos abiertos → Frame 2: ojos entrecerrados → Frame 3: ojos cerrados. Debe poder reproducirse en loop ida y vuelta.
- **Fila 2 — look_left** (2 frames): mirar a la izquierda. Frame 1: transición → Frame 2: mirando completamente a la izquierda. Las pupilas y/o la cabeza giran a la izquierda.
- **Fila 3 — look_right** (2 frames): mirar a la derecha. Espejado horizontal de look_left.
- **Fila 4 — drag** (2 frames): expresión de sorpresa al ser arrastrado. Ojos bien abiertos, boca en "O", posibles marcas de movimiento o líneas de expresión.

Dimensiones totales del sprite sheet: 128×160 píxeles (4 columnas × 5 filas de 32×32).

### Reglas estrictas
1. Cada frame debe ocupar exactamente 32×32 píxeles, sin excepción
2. El personaje debe estar centrado dentro de cada frame
3. No debe haber píxeles fuera del área de 32×32 de cada frame
4. Los frames vacíos (si una fila tiene menos de 4 frames) deben quedar completamente transparentes
5. El fondo de cada frame debe ser 100% transparente
6. Mantener consistencia pixel-perfect entre todos los frames: misma paleta, mismo grosor de línea, mismas proporciones
7. El formato de salida debe ser PNG con canal alfa (transparencia)
8. No usar dithering ni técnicas de medio tono
9. Cada píxel debe ser un color sólido de la paleta definida
```

## Notas de uso
- Este prompt está diseñado para herramientas de generación de imagen con IA (Midjourney, DALL-E, Stable Diffusion) o como brief para un artista pixel art
- Si la herramienta no respeta las dimensiones exactas, será necesario recortar y ajustar manualmente
- El archivo resultante debe guardarse como `src/assets/critter.png`
- El código actual espera exactamente esta disposición de filas/columnas (ver `src/js/main.js`)
