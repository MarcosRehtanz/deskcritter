import { z } from 'zod';
import { execSync } from 'child_process';

export function registerGitTools(server) {
  server.tool(
    'git_status',
    'Estado del repositorio git',
    {
      cwd: z.string().optional().describe('Directorio del repositorio'),
    },
    async ({ cwd }) => {
      try {
        const stdout = execSync('git status --porcelain=v1 -b', {
          cwd: cwd || undefined,
          encoding: 'utf-8',
          timeout: 10000,
        });
        return { content: [{ type: 'text', text: JSON.stringify({ output: stdout, exit_code: 0 }) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ output: err.stderr || err.message, exit_code: err.status ?? 1 }) }] };
      }
    }
  );

  server.tool(
    'git_log',
    'Log de commits recientes del repositorio',
    {
      cwd: z.string().optional().describe('Directorio del repositorio'),
      max_count: z.number().optional().describe('Máximo de commits (default: 20)'),
      format: z.string().optional().describe('Formato de salida (default: "%h %s (%an, %ar)")'),
    },
    async ({ cwd, max_count, format }) => {
      try {
        const count = max_count || 20;
        const fmt = format || '%h %s (%an, %ar)';
        const stdout = execSync(`git log --max-count=${count} --format="${fmt}"`, {
          cwd: cwd || undefined,
          encoding: 'utf-8',
          timeout: 10000,
        });
        return { content: [{ type: 'text', text: JSON.stringify({ output: stdout, exit_code: 0 }) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ output: err.stderr || err.message, exit_code: err.status ?? 1 }) }] };
      }
    }
  );

  server.tool(
    'git_diff',
    'Diff del repositorio git',
    {
      cwd: z.string().optional().describe('Directorio del repositorio'),
      cached: z.boolean().optional().describe('Mostrar diff de staged (default: false)'),
      ref1: z.string().optional().describe('Primera referencia'),
      ref2: z.string().optional().describe('Segunda referencia'),
    },
    async ({ cwd, cached, ref1, ref2 }) => {
      try {
        let cmd = 'git diff';
        if (cached) cmd += ' --cached';
        if (ref1) cmd += ` ${ref1}`;
        if (ref2) cmd += ` ${ref2}`;
        const stdout = execSync(cmd, {
          cwd: cwd || undefined,
          encoding: 'utf-8',
          timeout: 30000,
          maxBuffer: 10 * 1024 * 1024,
        });
        return { content: [{ type: 'text', text: JSON.stringify({ output: stdout, exit_code: 0 }) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ output: err.stderr || err.message, exit_code: err.status ?? 1 }) }] };
      }
    }
  );
}
