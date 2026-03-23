import { z } from 'zod';
import fs from 'fs';
import path from 'path';

export function registerGrepTools(server) {
  server.tool(
    'grep',
    'Busca un patrón regex en archivos recursivamente',
    {
      pattern: z.string().describe('Expresión regular a buscar'),
      path: z.string().optional().describe('Directorio raíz (default: ".")'),
      glob: z.string().optional().describe('Filtro glob para nombres de archivo (ej: "*.js")'),
      max_results: z.number().optional().describe('Máximo de resultados (default: 50)'),
    },
    async ({ pattern, path: rootPath, glob: globFilter, max_results }) => {
      const root = rootPath || '.';
      const max = max_results || 50;
      const re = new RegExp(pattern);
      const globRe = globFilter
        ? new RegExp('^' + globFilter.replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
        : null;

      const matches = [];

      function walk(dir) {
        if (matches.length >= max) return;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

        for (const entry of entries) {
          if (matches.length >= max) return;
          const full = path.join(dir, entry.name);

          // Saltar directorios ocultos y node_modules
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'target') continue;

          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.isFile()) {
            if (globRe && !globRe.test(entry.name)) continue;
            let content;
            try { content = fs.readFileSync(full, 'utf-8'); } catch { continue; }

            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (re.test(lines[i])) {
                matches.push({ file: full, line_number: i + 1, text: lines[i] });
                if (matches.length >= max) return;
              }
            }
          }
        }
      }

      walk(root);
      return { content: [{ type: 'text', text: JSON.stringify(matches) }] };
    }
  );
}
