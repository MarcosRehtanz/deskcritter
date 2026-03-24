import { z } from 'zod';
import { execSync } from 'child_process';

const isWin = process.platform === 'win32';

export function registerProcessTools(server) {
  server.tool(
    'process_list',
    'Lista procesos del sistema',
    {
      filter: z.string().optional().describe('Filtrar por nombre de proceso'),
      max_results: z.number().optional().describe('Máximo de resultados (default: 50)'),
    },
    async ({ filter, max_results }) => {
      try {
        const max = max_results || 50;
        let stdout;
        if (isWin) {
          stdout = execSync('powershell -NoProfile -Command "Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First ' + max + ' Id, ProcessName, CPU, @{N=\\"MemoryMB\\";E={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json"', {
            encoding: 'utf-8',
            timeout: 10000,
          });
        } else {
          stdout = execSync(`ps aux --sort=-%mem | head -${max + 1}`, {
            encoding: 'utf-8',
            timeout: 10000,
          });
        }

        let processes;
        if (isWin) {
          const parsed = JSON.parse(stdout);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          processes = arr
            .filter(p => !filter || p.ProcessName.toLowerCase().includes(filter.toLowerCase()))
            .map(p => ({ pid: p.Id, name: p.ProcessName, cpu_usage: p.CPU || 0, memory_mb: p.MemoryMB || 0 }));
        } else {
          processes = stdout.split('\n').slice(1).filter(Boolean)
            .map(line => {
              const parts = line.trim().split(/\s+/);
              return { pid: parseInt(parts[1]), name: parts[10] || '', cpu_usage: parseFloat(parts[2]) || 0, memory_mb: parseFloat(parts[5]) / 1024 || 0 };
            })
            .filter(p => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));
        }

        return { content: [{ type: 'text', text: JSON.stringify({ processes, total: processes.length }) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );

  server.tool(
    'process_kill',
    'Termina un proceso por PID',
    {
      pid: z.number().describe('ID del proceso a terminar'),
    },
    async ({ pid }) => {
      try {
        if (isWin) {
          execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf-8', timeout: 5000 });
        } else {
          execSync(`kill ${pid}`, { encoding: 'utf-8', timeout: 5000 });
        }
        return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }] };
      }
    }
  );
}
