// Manejo de entrada del usuario: drag & drop y seguimiento de cursor
// Emite eventos al bus en lugar de manipular módulos directamente
// Nota: el hotkey Ctrl+Shift+M se registra como global shortcut en main.js
import { eventBus } from './event-bus.js';

const CURSOR_THROTTLE_MS = 16; // ~1 frame

export class InputHandler {
  constructor(canvas) {
    this._canvas = canvas;
    this.isDragging = false;
    this._dragOffsetX = 0;
    this._dragOffsetY = 0;
    this._lastCursorTime = 0;

    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onContextMenu = this._handleContextMenu.bind(this);
  }

  init() {
    this._canvas.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
    this._canvas.addEventListener('contextmenu', this._onContextMenu);
  }

  destroy() {
    this._canvas.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    this._canvas.removeEventListener('contextmenu', this._onContextMenu);
  }

  _handleMouseDown(e) {
    this.isDragging = true;
    this._dragOffsetX = e.screenX;
    this._dragOffsetY = e.screenY;
    eventBus.emit('input:dragStart');
  }

  _handleMouseMove(e) {
    if (this.isDragging) {
      const deltaX = e.screenX - this._dragOffsetX;
      const deltaY = e.screenY - this._dragOffsetY;
      this._dragOffsetX = e.screenX;
      this._dragOffsetY = e.screenY;
      eventBus.emit('input:dragMove', { deltaX, deltaY });
    } else {
      const now = performance.now();
      if (now - this._lastCursorTime < CURSOR_THROTTLE_MS) return;
      this._lastCursorTime = now;
      const rect = this._canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const centerX = this._canvas.width / 2;
      eventBus.emit('input:cursorMove', { mouseX, centerX });
    }
  }

  _handleMouseUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    eventBus.emit('input:dragEnd');
  }

  _handleContextMenu(e) {
    e.preventDefault();
    eventBus.emit('input:contextMenu', { x: e.clientX, y: e.clientY });
  }
}
