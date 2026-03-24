// Sistema de físicas: gravedad, colisión con bordes de pantalla, movimiento
import * as config from './config.js';
import { eventBus } from './event-bus.js';

export class Physics {
  constructor(windowSize) {
    this.windowSize = windowSize;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.scaleFactor = 1;

    // Constantes (se leen de config)
    this.gravity = 1200;
    this.terminalVelocity = 900;
    this.walkSpeed = 70;
    this.bounceFactor = 0.25;
    this.bounceThreshold = 150;

    // Aplicar config inicial y escuchar cambios
    this.applyConfig();
    eventBus.on('config:updated', () => this.applyConfig());

    // Límites de pantalla (se inicializan en initScreenBounds)
    this.screenWidth = 1920;
    this.screenHeight = 1080;
    this.monitorX = 0;
    this.monitorY = 0;
    this.leftBound = 0;
    this.rightBound = 1920;
    this.groundY = this.screenHeight - this.windowSize;

    this.grounded = false;
  }

  // Re-lee las constantes de física desde config
  applyConfig() {
    this.gravity = config.get('physicsGravity') ?? 1200;
    this.terminalVelocity = config.get('physicsTerminalVelocity') ?? 900;
    this.walkSpeed = config.get('physicsWalkSpeed') ?? 70;
    this.bounceFactor = config.get('physicsBounceFactor') ?? 0.25;
    this.bounceThreshold = config.get('physicsBounceThreshold') ?? 150;
  }

  // Configurar límites de pantalla (datos provistos externamente por WindowManager)
  setScreenBounds(screenWidth, screenHeight, scaleFactor) {
    this.scaleFactor = scaleFactor;
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    const physicalWindowSize = this.windowSize * this.scaleFactor;
    this.groundY = this.screenHeight - physicalWindowSize;
    this.leftBound = 0;
    this.rightBound = this.screenWidth - physicalWindowSize;
  }

  // Actualizar bounds para un monitor específico (posición absoluta)
  setMonitorBounds(monitor) {
    this.scaleFactor = monitor.scaleFactor;
    this.screenWidth = monitor.width;
    this.screenHeight = monitor.height;
    this.monitorX = monitor.x || 0;
    this.monitorY = monitor.y || 0;
    const physicalWindowSize = this.windowSize * this.scaleFactor;
    this.groundY = this.monitorY + this.screenHeight - physicalWindowSize;
    this.leftBound = this.monitorX;
    this.rightBound = this.monitorX + this.screenWidth - physicalWindowSize;
  }

  // Establecer posición actual (coordenadas físicas)
  setPosition(x, y) {
    this.x = x;
    this.y = y;
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
    if (this.x <= this.leftBound) {
      this.x = this.leftBound;
      this.vx = 0;
      hitEdge = true;
    } else if (this.x >= this.rightBound) {
      this.x = this.rightBound;
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
