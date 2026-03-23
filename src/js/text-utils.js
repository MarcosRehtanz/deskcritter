// Utilidades compartidas de procesamiento de texto

export function stripAnsi(str) {
  return str
    .replace(/\x1B\[[0-9;?]*[A-Za-z@]/g, '')
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B[A-Z\\]/g, '')
    .replace(/[\x00-\x08\x0E-\x1F\x7F]/g, '')
    .replace(/\r/g, '')
    .trim();
}

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
