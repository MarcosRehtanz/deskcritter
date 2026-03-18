// Sistema de físicas: gravedad, colisión con bordes de pantalla, movimiento
export class Physics {
  constructor(windowSize) {
    this.windowSize = windowSize;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.scaleFactor = 1;

    // Constantes
    this.gravity = 1200;         // px/s²
    this.terminalVelocity = 900; // px/s
    this.walkSpeed = 70;         // px/s (lógicos)
    this.bounceFactor = 0.25;
    this.bounceThreshold = 150;

    // Límites de pantalla (se inicializan en initScreenBounds)
    this.screenWidth = 1920;
    this.screenHeight = 1080;
    this.groundY = this.screenHeight - this.windowSize;

    this.grounded = false;
  }

  // Detectar dimensiones reales de la pantalla vía Tauri
  async initScreenBounds() {
    try {
      const win = window.__TAURI__.window.getCurrentWindow();
      const pos = await win.outerPosition();
      this.x = pos.x;
      this.y = pos.y;

      const monitor = await win.currentMonitor();
      if (monitor) {
        this.scaleFactor = monitor.scaleFactor;
        this.screenWidth = monitor.size.width;
        this.screenHeight = monitor.size.height;
        // Tamaño físico de la ventana (lógico * scale)
        const physicalWindowSize = this.windowSize * this.scaleFactor;
        this.groundY = this.screenHeight - physicalWindowSize;
      }
    } catch {
      this.x = 600;
      this.y = 400;
      this.groundY = this.screenHeight - this.windowSize;
    }
  }

  // Actualizar posición cada frame (coordenadas físicas)
  update(dt) {
    const dtSec = Math.min(dt, 50) / 1000;

    // Gravedad
    if (!this.grounded) {
      this.vy += this.gravity * this.scaleFactor * dtSec;
      if (this.vy > this.terminalVelocity * this.scaleFactor) {
        this.vy = this.terminalVelocity * this.scaleFactor;
      }
    }

    // Aplicar velocidad
    this.x += this.vx * dtSec;
    this.y += this.vy * dtSec;

    // Colisión con suelo
    if (this.y >= this.groundY) {
      this.y = this.groundY;
      if (Math.abs(this.vy) > this.bounceThreshold * this.scaleFactor) {
        this.vy = -this.vy * this.bounceFactor;
      } else {
        this.vy = 0;
        this.grounded = true;
      }
    }

    // Colisión con techo
    if (this.y < 0) {
      this.y = 0;
      this.vy = Math.abs(this.vy) * 0.3;
    }

    // Colisión con bordes laterales
    let hitEdge = false;
    if (this.x <= 0) {
      this.x = 0;
      this.vx = 0;
      hitEdge = true;
    } else if (this.x >= this.screenWidth - this.windowSize * this.scaleFactor) {
      this.x = this.screenWidth - this.windowSize * this.scaleFactor;
      this.vx = 0;
      hitEdge = true;
    }

    return {
      x: Math.round(this.x),
      y: Math.round(this.y),
      grounded: this.grounded,
      hitEdge
    };
  }

  // Iniciar caminata (velocidad en coordenadas físicas)
  startWalk(direction) {
    this.vx = direction * this.walkSpeed * this.scaleFactor;
  }

  stopWalk() {
    this.vx = 0;
  }

  // Soltar después de drag
  release() {
    this.vy = 0;
    this.vx = 0;
    this.grounded = false;
  }
}
