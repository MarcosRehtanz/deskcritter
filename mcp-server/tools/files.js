import { z } from 'zod';
import fs from 'fs';
import path from 'path';

export function registerFileTools(server) {
  server.tool(
    'file_read',
    'Lee un archivo del PC del usuario',
    {
      path: z.string().describe('Ruta del archivo'),
      offset: z.number().optional().describe('Línea de inicio (0-indexed)'),
      limit: z.number().optional().describe('Número de líneas a leer'),
    },
    async ({ path: filePath, offset, limit }) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.min(offset || 0, lines.length);
      const end = limit ? Math.min(start + limit, lines.length) : lines.length;
      const result = lines.slice(start, end).join('\n');
      return { content: [{ type: 'text', text: result }] };
    }
  );

  server.tool(
    'file_write',
    'Escribe contenido a un archivo en el PC del usuario',
    {
      path: z.string().describe('Ruta del archivo'),
      content: z.string().describe('Contenido a escribir'),
    },
    async ({ path: filePath, content }) => {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content);
      return { content: [{ type: 'text', text: 'OK' }] };
    }
  );

  server.tool(
    'file_edit',
    'Reemplaza una cadena exacta por otra en un archivo',
    {
      path: z.string().describe('Ruta del archivo'),
      old_string: z.string().describe('Texto a reemplazar (debe ser único)'),
      new_string: z.string().describe('Texto de reemplazo'),
    },
    async ({ path: filePath, old_string, new_string }) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const count = content.split(old_string).length - 1;
      if (count === 0) throw new Error(`old_string no encontrado en ${filePath}`);
      if (count > 1) throw new Error(`old_string tiene ${count} ocurrencias (debe ser única)`);
      fs.writeFileSync(filePath, content.replace(old_string, new_string));
      return { content: [{ type: 'text', text: 'OK' }] };
    }
  );

  server.tool(
    'file_list',
    'Lista archivos en un directorio',
    {
      path: z.string().describe('Ruta del directorio'),
      pattern: z.string().optional().describe('Filtro glob (ej: "*.js")'),
    },
    async ({ path: dirPath, pattern }) => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      let result = entries.map((e) => ({
        name: e.name,
        is_dir: e.isDirectory(),
        size: e.isFile() ? fs.statSync(path.join(dirPath, e.name)).size : 0,
      }));

      if (pattern) {
        // Filtro glob simple (convierte *.ext a regex)
        const re = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        result = result.filter((e) => re.test(e.name));
      }

      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );
}
