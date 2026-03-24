import { z } from 'zod';
import { execSync } from 'child_process';

const isWin = process.platform === 'win32';

export function registerClipboardTools(server) {
  server.tool(
    'clipboard_read',
    'Lee el texto del portapapeles del usuario',
    {},
    async () => {
      try {
        const text = isWin
          ? execSync('powershell -NoProfile -Command "Get-Clipboard"', {
              encoding: 'utf-8',
              timeout: 5000,
            }).trimEnd()
          : execSync('xclip -selection clipboard -o', {
              encoding: 'utf-8',
              timeout: 5000,
            }).trimEnd();
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        throw new Error(`Error leyendo clipboard: ${err.message}`);
      }
    }
  );

  server.tool(
    'clipboard_write',
    'Escribe texto al portapapeles del usuario',
    {
      text: z.string().describe('Texto a copiar al portapapeles'),
    },
    async ({ text }) => {
      try {
        if (isWin) {
          execSync(`powershell -NoProfile -Command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`  , {
            encoding: 'utf-8',
            timeout: 5000,
          });
        } else {
          execSync('xclip -selection clipboard', {
            input: text,
            encoding: 'utf-8',
            timeout: 5000,
          });
        }
        return { content: [{ type: 'text', text: 'OK' }] };
      } catch (err) {
        throw new Error(`Error escribiendo clipboard: ${err.message}`);
      }
    }
  );
}
