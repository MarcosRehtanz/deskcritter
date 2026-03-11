// Cargador y animador de sprites
export class SpriteAnimator {
  constructor(ctx, frameWidth, frameHeight, scale = 4) {
    this.ctx = ctx;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this.scale = scale;
    this.animations = {};
    this.currentAnim = null;
    this.currentFrame = 0;
    this.elapsed = 0;
    this.image = null;
  }

  // Carga la imagen del sprite sheet
  async loadSheet(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { this.image = img; resolve(); };
      img.onerror = reject;
      img.src = src;
    });
  }

  // Registra una animación: nombre, fila en el sheet, cantidad de frames, velocidad
  addAnimation(name, row, frameCount, frameDuration = 200) {
    this.animations[name] = { row, frameCount, frameDuration };
  }

  // Reproduce una animación por nombre
  play(name) {
    if (this.currentAnim === name) return;
    this.currentAnim = name;
    this.currentFrame = 0;
    this.elapsed = 0;
  }

  // Actualiza el frame según el tiempo transcurrido
  update(deltaTime) {
    if (!this.currentAnim) return;
    const anim = this.animations[this.currentAnim];
    if (!anim) return;

    this.elapsed += deltaTime;
    if (this.elapsed >= anim.frameDuration) {
      this.elapsed -= anim.frameDuration;
      this.currentFrame = (this.currentFrame + 1) % anim.frameCount;
    }
  }

  // Dibuja el frame actual en el canvas
  draw() {
    if (!this.image || !this.currentAnim) return;
    const anim = this.animations[this.currentAnim];
    if (!anim) return;

    const sx = this.currentFrame * this.frameWidth;
    const sy = anim.row * this.frameHeight;
    const dw = this.frameWidth * this.scale;
    const dh = this.frameHeight * this.scale;
    // Centrar en el canvas
    const dx = (this.ctx.canvas.width - dw) / 2;
    const dy = (this.ctx.canvas.height - dh) / 2;

    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.imageSmoothingEnabled = false; // Pixel art nítido
    this.ctx.drawImage(this.image, sx, sy, this.frameWidth, this.frameHeight, dx, dy, dw, dh);
  }
}
