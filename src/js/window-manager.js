// Abstracción de la API de ventana Tauri
// Centraliza toda interacción con window.__TAURI__ para que
// ningún otro módulo necesite conocer Tauri directamente
export class WindowManager {
  constructor() {
    this._win = null;
    this._tauri = null;
    // Cache para evitar IPC redundantes
    this._lastW = null;
    this._lastH = null;
    this._lastX = null;
    this._lastY = null;
  }

  async init() {
    try {
      this._tauri = window.__TAURI__.window;
      this._win = this._tauri.getCurrentWindow();
    } catch (e) {
      console.warn('[wm]', 'init error', e);
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
    } catch (e) {
      console.warn('[wm]', 'getPosition error', e);
      return { x: 600, y: 400 };
    }
  }

  // Posicionar la ventana en coordenadas físicas absolutas
  async setPosition(x, y) {
    if (!this._tauri) return;
    const rx = Math.round(x), ry = Math.round(y);
    if (this._lastX === rx && this._lastY === ry) return;
    this._lastX = rx;
    this._lastY = ry;
    try {
      await this._win.setPosition(
        new this._tauri.PhysicalPosition(rx, ry)
      );
    } catch (e) { console.warn('[wm]', 'setPosition error', e); }
  }

  // Mover la ventana relativamente (para drag)
  async moveBy(deltaX, deltaY) {
    if (!this._tauri) return;
    try {
      const pos = await this._win.outerPosition();
      await this._win.setPosition(
        new this._tauri.PhysicalPosition(pos.x + deltaX, pos.y + deltaY)
      );
    } catch (e) { console.warn('[wm]', 'moveBy error', e); }
  }

  // Redimensionar la ventana (coordenadas lógicas)
  async setSize(width, height) {
    if (!this._tauri) return;
    if (this._lastW === width && this._lastH === height) return;
    this._lastW = width;
    this._lastH = height;
    try {
      await this._win.setSize(
        new this._tauri.LogicalSize(width, height)
      );
    } catch (e) { console.warn('[wm]', 'setSize error', e); }
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
    } catch (e) { console.warn('[wm]', 'toggleVisibility error', e); }
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
    } catch (e) {
      console.warn('[wm]', 'getAvailableMonitors error', e);
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
    } catch (e) {
      console.warn('[wm]', 'getMonitorInfo error', e);
      return { width: 1920, height: 1080, scaleFactor: 1 };
    }
  }
}
