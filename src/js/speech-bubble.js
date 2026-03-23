// Burbuja de texto integrada en la ventana principal
// Renderiza un div dentro de #critter-area, arriba del canvas
import { eventBus } from './event-bus.js';
import { dbg } from './debug.js';
import * as config from './config.js';
import { renderMarkdown } from './chat.js';

const DISMISS_DELAY = 12000;
const DOTS_CYCLE = ['.', '..', '...', '..', '.'];

function stripAnsi(str) {
  return str
    .replace(/\x1B\[[0-9;?]*[A-Za-z@]/g, '')
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B[A-Z\\]/g, '')
    .replace(/[\x00-\x08\x0E-\x1F\x7F]/g, '')
    .replace(/\r/g, '')
    .trim();
}

// Limpia markdown del texto para que el TTS no lea asteriscos ni símbolos
export function cleanForTts(text) {
  if (!text) return '';
  return stripAnsi(
    text
      .replace(/```[\s\S]*?```/g, '')         // bloques de código → eliminar
      .replace(/`([^`]*)`/g, '$1')            // inline code → solo texto
      .replace(/\*\*([^*]+)\*\*/g, '$1')      // **bold**
      .replace(/__([^_]+)__/g, '$1')          // __bold__
      .replace(/\*([^*]+)\*/g, '$1')          // *italic*
      .replace(/_([^_]+)_/g, '$1')            // _italic_
      .replace(/~~([^~]+)~~/g, '$1')          // ~~strikethrough~~
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [texto](url) → texto
      .replace(/^#{1,6}\s+/gm, '')            // headers → quitar #
      .replace(/^[-—]\s+/gm, '')              // listas → quitar marcador
      .replace(/\s{2,}/g, ' ')                // colapsar espacios múltiples
      .replace(/\n{2,}/g, '\n')               // colapsar saltos múltiples
      .trim()
  );
}

export class SpeechBubble {
  constructor() {
    this._visible = false;
    this._el = null;
    this._textEl = null;
    this._closeBtn = null;
    this._dismissTimer = null;
    this._dotsTimer = null;
    this._built = false;
  }

  // Crear el elemento DOM (lazy)
  _ensureDom() {
    if (this._built) return;
    this._built = true;

    const area = document.getElementById('critter-area');

    this._el = document.createElement('div');
    this._el.className = 'speech-bubble hidden';

    this._closeBtn = document.createElement('button');
    this._closeBtn.className = 'bubble-close';
    this._closeBtn.innerHTML = '&times;';
    this._closeBtn.addEventListener('click', () => this.hide());

    this._textEl = document.createElement('span');
    this._textEl.id = 'bubble-text';

    this._el.appendChild(this._closeBtn);
    this._el.appendChild(this._textEl);

    // Insertar antes del canvas (arriba visualmente)
    area.insertBefore(this._el, area.firstChild);
    dbg('bubble', 'DOM creado en #critter-area');
  }

  _clearButtons() {
    const existing = this._el?.querySelector('.bubble-buttons');
    if (existing) existing.remove();
  }

  _isEnabled() {
    return config.get('bubbleEnabled') !== false;
  }

  // Mostrar texto (o actualizar si ya visible)
  show(text) {
    if (!this._isEnabled()) return;
    if (!text || !text.trim()) return;
    this._ensureDom();
    clearInterval(this._dotsTimer);
    clearTimeout(this._dismissTimer);

    const clean = stripAnsi(text);
    if (!clean) return;

    this._textEl.innerHTML = renderMarkdown(clean);
    this._el.classList.remove('hidden');
    this._el.classList.add('visible');
    this._visible = true;
    this._el.scrollTop = this._el.scrollHeight;
    eventBus.emit('bubble:show');
  }

  // Mostrar animación de puntos
  showDots() {
    if (!this._isEnabled()) return;
    this._ensureDom();
    clearTimeout(this._dismissTimer);
    let idx = 0;
    this._textEl.textContent = DOTS_CYCLE[0];
    this._el.classList.remove('hidden');
    this._el.classList.add('visible');
    this._visible = true;

    clearInterval(this._dotsTimer);
    this._dotsTimer = setInterval(() => {
      idx = (idx + 1) % DOTS_CYCLE.length;
      this._textEl.textContent = DOTS_CYCLE[idx];
    }, 400);
    eventBus.emit('bubble:show');
  }

  // Respuesta completa — iniciar timer de dismiss
  done() {
    clearInterval(this._dotsTimer);
    if (this._el) this._el.scrollTop = 0;
    clearTimeout(this._dismissTimer);
    const delay = config.get('bubbleDismissMs') ?? DISMISS_DELAY;
    this._dismissTimer = setTimeout(() => this.hide(), delay);
  }

  // Mostrar botones inline
  showButtons(buttons) {
    if (!this._isEnabled()) return;
    if (!buttons?.length) return;
    this._ensureDom();
    this._clearButtons();

    const container = document.createElement('div');
    container.className = 'bubble-buttons';
    for (const row of buttons) {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'bubble-btn-row';
      for (const btn of row) {
        const button = document.createElement('button');
        button.className = 'bubble-btn';
        button.textContent = btn.text;
        button.addEventListener('click', () => {
          container.querySelectorAll('.bubble-btn').forEach(b => b.disabled = true);
          button.classList.add('selected');
          eventBus.emit('bubble:callback', btn.callback_data);
        });
        rowDiv.appendChild(button);
      }
      container.appendChild(rowDiv);
    }
    this._el.appendChild(container);
    this._el.classList.remove('hidden');
    this._el.classList.add('visible');
    this._visible = true;
    clearTimeout(this._dismissTimer);
    eventBus.emit('bubble:show');
  }

  // Ocultar burbuja
  hide() {
    if (!this._visible) return;
    clearTimeout(this._dismissTimer);
    clearInterval(this._dotsTimer);
    this._visible = false;
    if (this._el) {
      this._el.classList.remove('visible');
      this._el.classList.add('hidden');
      this._textEl.textContent = '';
      this._clearButtons();
    }
    eventBus.emit('bubble:hide');
  }

  // No-op — ya no hay ventana separada que reposicionar
  reposition() {}

  get visible() {
    return this._visible;
  }
}
