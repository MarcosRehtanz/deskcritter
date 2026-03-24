import { z } from 'zod';
import { execSync } from 'child_process';

const isWin = process.platform === 'win32';

export function registerBashTools(server) {
  server.tool(
    'bash',
    'Ejecuta un comando en el shell nativo del PC del usuario',
    {
      command: z.string().describe('Comando a ejecutar'),
      cwd: z.string().optional().describe('Directorio de trabajo'),
      timeout_ms: z.number().optional().describe('Timeout en ms (default: 60000)'),
    },
    async ({ command, cwd, timeout_ms }) => {
      try {
        const opts = {
          cwd: cwd || undefined,
          timeout: timeout_ms || 60000,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        };

        const stdout = isWin
          ? execSync(`powershell -NoProfile -Command "${command.replace(/"/g, '\\"')}"`, opts)
          : execSync(command, opts);

        return { content: [{ type: 'text', text: JSON.stringify({ stdout, stderr: '', exit_code: 0 }) }] };
      } catch (err) {
        const result = {
          stdout: err.stdout || '',
          stderr: err.stderr || err.message,
          exit_code: err.status ?? 1,
        };
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
    }
  );
}
