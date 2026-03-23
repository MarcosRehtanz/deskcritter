// Abstracción de la API de ventana Tauri
// Centraliza toda interacción con window.__TAURI__ para que
// ningún otro módulo necesite conocer Tauri directamente
export class WindowManager {
  constructor() {
    this._win = null;
    this._tauri = null;
  }

  async init() {
    try {
      this._tauri = window.__TAURI__.window;
      this._win = this._tauri.getCurrentWindow();
    } catch {
      this._win = null;
      this._tauri = null;
    }
  }

  // Obtener posición actual de la ventana (coordenadas físicas)
  async getPosition() {
    if (!this._win) return { x: 600, y: 400 };
    try {
      const pos = await this._win.outerPosition();
      return { x: pos.x, y: pos.y };
    } catch {
      return { x: 600, y: 400 };
    }
  }

  // Posicionar la ventana en coordenadas físicas absolutas
  async setPosition(x, y) {
    if (!this._tauri) return;
    try {
      await this._win.setPosition(
        new this._tauri.PhysicalPosition(Math.round(x), Math.round(y))
      );
    } catch {}
  }

  // Mover la ventana relativamente (para drag)
  async moveBy(deltaX, deltaY) {
    if (!this._tauri) return;
    try {
      const pos = await this._win.outerPosition();
      await this._win.setPosition(
        new this._tauri.PhysicalPosition(pos.x + deltaX, pos.y + deltaY)
      );
    } catch {}
  }

  // Redimensionar la ventana (coordenadas lógicas)
  async setSize(width, height) {
    if (!this._tauri) return;
    try {
      await this._win.setSize(
        new this._tauri.LogicalSize(width, height)
      );
    } catch {}
  }

  // Toggle visibilidad de la ventana
  async toggleVisibility() {
    if (!this._win) return;
    try {
      const visible = await this._win.isVisible();
      if (visible) {
        await this._win.hide();
      } else {
        await this._win.show();
      }
    } catch {}
  }

  // Obtener todos los monitores disponibles
  async getAvailableMonitors() {
    if (!this._win) return [];
    try {
      const monitors = await this._win.availableMonitors();
      return monitors.map(m => ({
        name: m.name,
        width: m.size.width,
        height: m.size.height,
        x: m.position.x,
        y: m.position.y,
        scaleFactor: m.scaleFactor,
      }));
    } catch {
      return [];
    }
  }

  // Obtener info del monitor actual
  async getMonitorInfo() {
    if (!this._win) return { width: 1920, height: 1080, scaleFactor: 1 };
    try {
      const monitor = await this._win.currentMonitor();
      if (!monitor) return { width: 1920, height: 1080, scaleFactor: 1 };
      return {
        width: monitor.size.width,
        height: monitor.size.height,
        scaleFactor: monitor.scaleFactor
      };
    } catch {
      return { width: 1920, height: 1080, scaleFactor: 1 };
    }
  }
}
