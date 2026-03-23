// Chat integrado — panel lateral con historial, input, streaming
// Compatible con terminal-live (misma interfaz que Telegram)
import { eventBus } from './event-bus.js';
import { dbg } from './debug.js';
import * as config from './config.js';
import { addMessage, deleteOldMessages } from './db.js';

function stripAnsi(str) {
  return str
    .replace(/\x1B\[[0-9;?]*[A-Za-z@]/g, '')
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B[A-Z\\]/g, '')
    .replace(/[\x00-\x08\x0E-\x1F\x7F]/g, '')
    .replace(/\r/g, '')
    .trim();
}

const COMMANDS = [
  { cmd: '/nueva',     desc: 'Nueva conversación' },
  { cmd: '/modelo',    desc: 'Ver o cambiar modelo' },
  { cmd: '/modo',      desc: 'Modo: auto/ask/plan' },
  { cmd: '/costo',     desc: 'Costo de la sesión' },
  { cmd: '/estado',    desc: 'Estado detallado' },
  { cmd: '/agentes',   desc: 'Listar agentes' },
  { cmd: '/skills',    desc: 'Skills instalados' },
  { cmd: '/consola',   desc: 'Modo consola bash' },
  { cmd: '/whisper',   desc: 'Ver/cambiar modelo Whisper' },
  { cmd: '/tts',       desc: 'Ver/configurar text-to-speech' },
  { cmd: '/recordar',  desc: 'Crear recordatorio' },
  { cmd: '/ayuda',     desc: 'Todos los comandos' },
];

const CHAT_WIDTH = 320;
const CRITTER_WIDTH = 96;
const CRITTER_HEIGHT = 96;
const CHAT_HEIGHT = 450;

// --- Markdown ligero (sin dependencias) ---

export function renderMarkdown(text) {
  // Escapar HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bloques de código ```
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g,
    (_, lang, code) => `<pre><code>${code.trim()}</code></pre>`);

  // Código inline `texto`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold **texto** o __texto__
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic *texto* o _texto_ (sin matchear los ** ya procesados)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');

  // Strikethrough ~~texto~~
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Links [texto](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Headers (# ## ###) — solo al inicio de línea
  html = html.replace(/^### (.+)$/gm, '<strong style="font-size:13px">$1</strong>');
  html = html.replace(/^## (.+)$/gm, '<strong style="font-size:14px">$1</strong>');
  html = html.replace(/^# (.+)$/gm, '<strong style="font-size:15px">$1</strong>');

  // Listas con — o - al inicio
  html = html.replace(/^[—–-] (.+)$/gm, '• $1');

  // Saltos de línea
  html = html.replace(/\n/g, '<br>');

  // Limpiar <br> antes/después de <pre>
  html = html.replace(/<br><pre>/g, '<pre>');
  html = html.replace(/<\/pre><br>/g, '</pre>');

  return html;
}

function timeStr() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' +
         d.getMinutes().toString().padStart(2, '0');
}

// --- ChatPanel ---

export class ChatPanel {
  constructor(windowManager, server, anchor) {
    this._wm = windowManager;
    this._server = server;
    // Anchor: esquina inferior-derecha fija del critter
    this._anchorRight = anchor?.right ?? 1264;
    this._anchorBottom = anchor?.bottom ?? 577;
    this._open = false;
    this._streamingEl = null;
    this._streamingTextEl = null;
    this._typingEl = null;

    // DOM
    this._panel = document.getElementById('chat-panel');
    this._messages = document.getElementById('chat-messages');
    this._input = document.getElementById('chat-input');
    this._sendBtn = document.getElementById('chat-send');
    this._connDot = document.getElementById('chat-conn-dot');
    this._cmdBtn = document.getElementById('chat-cmd-btn');
    this._cmdMenu = document.getElementById('chat-cmd-menu');
    this._cmdOpen = false;
    this._cmdActiveIdx = -1;

    this._bindEvents();
    this._bindBus();
  }

  get open() { return this._open; }

  updateAnchor(right, bottom) {
    this._anchorRight = right;
    this._anchorBottom = bottom;
  }

  async toggle() {
    this._open ? await this.close() : await this.show();
  }

  async show() {
    if (this._open) return;
    this._open = true;
    dbg('chat', 'abriendo panel');

    // Expandir ventana a la izquierda y hacia arriba (el critter se queda en su lugar)
    const chatW = config.get('chatWidth') ?? CHAT_WIDTH;
    const chatH = config.get('chatHeight') ?? CHAT_HEIGHT;
    const totalW = chatW + CRITTER_WIDTH;
    const totalH = chatH;
    await this._wm.setPosition(this._anchorRight - totalW, this._anchorBottom - totalH);
    await this._wm.setSize(totalW, totalH);

    this._panel.classList.add('open');
    document.getElementById('chat-btn').classList.add('open');

    // Focus en el input
    setTimeout(() => this._input.focus(), 300);

    // Scroll al final
    this._scrollToBottom();
  }

  async close() {
    if (!this._open) return;
    this._open = false;
    dbg('chat', 'cerrando panel');

    this._panel.classList.remove('open');
    document.getElementById('chat-btn').classList.remove('open');

    // Restaurar tamaño original
    await this._wm.setPosition(this._anchorRight - CRITTER_WIDTH, this._anchorBottom - CRITTER_HEIGHT);
    await this._wm.setSize(CRITTER_WIDTH, CRITTER_HEIGHT);
  }

  // Enviar mensaje al server
  send(text) {
    if (!text.trim()) return;
    dbg('chat', 'send()', { text, connected: this._server.connected, busy: this._server.busy });
    if (!this._server.connected) {
      this._addSystem('Sin conexión al server');
      return;
    }
    if (this._server.busy) {
      this._addSystem('Esperando respuesta...');
      return;
    }

    this._addUser(text);
    this._server.send(text);
    this._input.value = '';
    this._autoResize();
    this._showTyping();

    // Persistir mensaje del usuario en historial
    this._saveMessage('user', text);
  }

  // --- Mensajes ---

  _addUser(text) {
    const el = this._createMsg('user');
    const body = document.createElement('div');
    body.className = 'chat-msg-body';
    body.textContent = text;
    el.appendChild(body);
    el.appendChild(this._createTime());
    this._messages.appendChild(el);
    this._scrollToBottom();
  }

  _addBot(html) {
    this._hideTyping();
    const el = this._createMsg('bot');
    const body = document.createElement('div');
    body.className = 'chat-msg-body';
    body.innerHTML = html;
    el.appendChild(body);
    el.appendChild(this._createTime());
    this._messages.appendChild(el);
    this._scrollToBottom();
    return el;
  }

  _addSystem(text) {
    const el = this._createMsg('system');
    el.textContent = stripAnsi(text);
    this._messages.appendChild(el);
    this._scrollToBottom();
  }

  _showTyping() {
    this._hideTyping();
    this._typingEl = document.createElement('div');
    this._typingEl.className = 'chat-typing';
    this._typingEl.innerHTML = '<span></span><span></span><span></span>';
    this._messages.appendChild(this._typingEl);
    this._scrollToBottom();
  }

  _hideTyping() {
    if (this._typingEl) {
      this._typingEl.remove();
      this._typingEl = null;
    }
  }

  _startStreaming() {
    this._hideTyping();
    this._streamingEl = this._createMsg('bot streaming');
    this._streamingTextEl = document.createElement('div');
    this._streamingTextEl.className = 'chat-msg-body';
    this._streamingEl.appendChild(this._streamingTextEl);
    this._messages.appendChild(this._streamingEl);
    this._scrollToBottom();
  }

  _updateStreaming(text) {
    if (!this._streamingEl) {
      this._startStreaming();
    }
    // Renderizar markdown en vivo durante streaming
    this._streamingTextEl.innerHTML = renderMarkdown(stripAnsi(text));
    this._scrollToBottom();
  }

  _finishStreaming() {
    if (this._streamingEl) {
      this._streamingEl.classList.remove('streaming');
      this._streamingEl.appendChild(this._createTime());
      this._streamingEl = null;
      this._streamingTextEl = null;
    }
  }

  _createMsg(className) {
    const el = document.createElement('div');
    el.className = 'chat-msg ' + className;
    return el;
  }

  _createTime() {
    const time = document.createElement('span');
    time.className = 'chat-msg-time';
    time.textContent = timeStr();
    return time;
  }

  _scrollToBottom() {
    requestAnimationFrame(() => {
      this._messages.scrollTop = this._messages.scrollHeight;
    });
  }

  // --- Input ---

  _bindEvents() {
    // Enviar con click
    this._sendBtn.addEventListener('click', () => {
      this.send(this._input.value);
    });

    // Enviar con Enter (Shift+Enter para nueva línea)
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._closeCmdMenu();
        return;
      }
      if (this._cmdOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this._moveCmdActive(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this._moveCmdActive(-1);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const items = this._cmdMenu.querySelectorAll('.chat-cmd-item');
          if (items.length > 0) {
            const idx = this._cmdActiveIdx >= 0 ? this._cmdActiveIdx : 0;
            items[idx]?.click();
          }
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          const items = this._cmdMenu.querySelectorAll('.chat-cmd-item');
          if (items.length > 0) {
            const idx = this._cmdActiveIdx >= 0 ? this._cmdActiveIdx : 0;
            const cmd = items[idx]?.dataset.cmd;
            if (cmd) {
              this._input.value = cmd + ' ';
              this._closeCmdMenu();
            }
          }
          return;
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send(this._input.value);
      }
    });

    // Auto-resize + autocompletado de comandos
    this._input.addEventListener('input', () => {
      this._autoResize();
      this._handleCmdAutocomplete();
    });

    // Botón / → toggle menú
    this._cmdBtn.addEventListener('click', () => {
      if (this._cmdOpen) {
        this._closeCmdMenu();
      } else {
        this._showCmdMenu(COMMANDS);
      }
    });

    // Click fuera cierra menú
    document.addEventListener('click', (e) => {
      if (!this._cmdOpen) return;
      if (this._cmdMenu.contains(e.target) || this._cmdBtn.contains(e.target) || this._input.contains(e.target)) return;
      this._closeCmdMenu();
    });
  }

  _autoResize() {
    this._input.style.height = 'auto';
    this._input.style.height = Math.min(this._input.scrollHeight, 80) + 'px';
  }

  // --- Menú de comandos ---

  _showCmdMenu(commands) {
    this._cmdMenu.innerHTML = '';
    if (commands.length === 0) {
      this._closeCmdMenu();
      return;
    }
    for (const { cmd, desc } of commands) {
      const item = document.createElement('div');
      item.className = 'chat-cmd-item';
      item.dataset.cmd = cmd;
      item.innerHTML = `<span class="cmd-name">${cmd}</span><span class="cmd-desc">${desc}</span>`;
      item.addEventListener('click', () => {
        this._closeCmdMenu();
        this._input.value = '';
        this.send(cmd);
        this._input.focus();
      });
      this._cmdMenu.appendChild(item);
    }
    this._cmdMenu.classList.remove('hidden');
    this._cmdOpen = true;
    this._cmdActiveIdx = -1;
  }

  _closeCmdMenu() {
    this._cmdMenu.classList.add('hidden');
    this._cmdOpen = false;
    this._cmdActiveIdx = -1;
  }

  _moveCmdActive(dir) {
    const items = this._cmdMenu.querySelectorAll('.chat-cmd-item');
    if (!items.length) return;
    items[this._cmdActiveIdx]?.classList.remove('active');
    this._cmdActiveIdx += dir;
    if (this._cmdActiveIdx < 0) this._cmdActiveIdx = items.length - 1;
    if (this._cmdActiveIdx >= items.length) this._cmdActiveIdx = 0;
    items[this._cmdActiveIdx].classList.add('active');
    items[this._cmdActiveIdx].scrollIntoView({ block: 'nearest' });
  }

  _handleCmdAutocomplete() {
    const val = this._input.value;
    // Solo autocompletar si empieza con / y es la primera línea
    if (val.startsWith('/') && !val.includes('\n')) {
      const query = val.toLowerCase();
      const filtered = COMMANDS.filter(c => c.cmd.startsWith(query));
      if (filtered.length > 0) {
        this._showCmdMenu(filtered);
      } else {
        this._closeCmdMenu();
      }
    } else {
      this._closeCmdMenu();
    }
  }

  // --- Event bus ---

  _bindBus() {
    // Conexión
    eventBus.on('server:connected', () => {
      this._connDot.className = 'connected';
      if (this._open) this._addSystem('Conectado');
    });
    eventBus.on('server:disconnected', () => {
      this._connDot.className = 'disconnected';
    });

    // Session ID (como Telegram recibe confirmación)
    eventBus.on('server:session', ({ id }) => {
      dbg('chat', 'sesión', id);
    });

    // Streaming de respuesta (siempre registrar, aunque chat cerrado)
    eventBus.on('server:chunk', ({ accumulated }) => {
      this._updateStreaming(accumulated);
    });

    // Respuesta completa
    eventBus.on('server:done', ({ text }) => {
      this._finishStreaming();
      // Persistir respuesta del bot en historial
      this._saveMessage('bot', text);
    });

    // Busy
    eventBus.on('server:busy', (busy) => {
      this._sendBtn.disabled = busy;
    });

    // Audio transcrito → mostrarlo como mensaje del usuario
    eventBus.on('audio:result', ({ text }) => {
      if (text) {
        this._addUser(text);
        // Persistir transcripción en historial
        this._saveMessage('user', text);
      }
    });

    // Botones inline (como Telegram inline keyboard)
    eventBus.on('server:buttons', ({ text, buttons }) => {
      this._finishStreaming();
      if (text) this._addSystem(text);
      this._addButtons(buttons);
    });
  }

  // --- Persistencia de mensajes en SQLite ---

  async _saveMessage(role, text) {
    if (!text) return;
    if (config.get('chatHistoryEnabled') === false) return;
    const sessionId = this._server.sessionId || 'unknown';
    try {
      await addMessage(sessionId, role, text);
      // Limpiar mensajes antiguos si hay límite configurado
      const max = config.get('chatHistoryMax');
      if (max > 0) await deleteOldMessages(max);
    } catch (e) {
      dbg('chat', 'error guardando mensaje en historial', e);
    }
  }

  // --- Botones inline ---

  _addButtons(buttons) {
    if (!buttons || !buttons.length) return;

    const container = document.createElement('div');
    container.className = 'chat-buttons';

    for (const row of buttons) {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'chat-btn-row';

      for (const btn of row) {
        const button = document.createElement('button');
        button.className = 'chat-btn';
        button.textContent = btn.text;
        button.dataset.action = btn.callback_data;

        button.addEventListener('click', () => {
          // Deshabilitar todos los botones del grupo
          container.querySelectorAll('.chat-btn').forEach(b => {
            b.disabled = true;
          });
          button.classList.add('selected');

          // Enviar callback al server
          if (this._server.sendCallback) {
            this._server.sendCallback(btn.callback_data);
          } else {
            // Fallback: enviar como comando
            this._server.send('/' + btn.callback_data);
          }
        });

        rowDiv.appendChild(button);
      }

      container.appendChild(rowDiv);
    }

    this._messages.appendChild(container);
    this._scrollToBottom();
  }
}
