# Tools y acciones remotas

El sistema de tools permite que terminal-live ejecute operaciones en el PC del usuario. Cada tool existe en tres capas: Rust (ejecución real), JS (wrapper + dispatch), y MCP (server standalone).

## Flujo de ejecución

```
terminal-live
  → { type: "action", id: "uuid", tool: "bash", args: { command: "dir" } }
  → WebSocket / DataChannel P2P
  → deskcritter action-handler.js
  → TOOL_MAP["bash"](args)
  → window.__TAURI__.core.invoke("cu_bash", args)
  → Rust tools/bash.rs
  → PowerShell / cmd
  → resultado
  → { type: "action_result", id: "uuid", result: { stdout, stderr, exit_code } }
  → terminal-live
```

## Tabla de tools

### bash

Ejecuta un comando en shell (PowerShell en Windows, bash en Linux/macOS).

| Argumento | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `command` | string | sí | Comando a ejecutar |
| `cwd` | string | no | Directorio de trabajo |
| `timeout_ms` | number | no | Timeout en millisegundos |

**Resultado:** `{ stdout, stderr, exit_code }`

### file_read

Lee el contenido de un archivo.

| Argumento | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `path` | string | sí | Ruta del archivo |
| `offset` | number | no | Línea inicial (0-based) |
| `limit` | number | no | Cantidad de líneas a leer |

**Resultado:** `{ content }`

### file_write

Escribe contenido a un archivo (crea o sobreescribe).

| Argumento | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `path` | string | sí | Ruta del archivo |
| `content` | string | sí | Contenido a escribir |

**Resultado:** `{}`

### file_edit

Reemplaza texto dentro de un archivo existente.

| Argumento | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `path` | string | sí | Ruta del archivo |
| `old_string` | string | sí | Texto a reemplazar |
| `new_string` | string | sí | Texto de reemplazo |

**Resultado:** `{}`

### file_list

Lista archivos y directorios.

| Argumento | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `path` | string | sí | Directorio a listar |
| `pattern` | string | no | Patrón glob para filtrar |

**Resultado:** `{ entries: [{ name, is_dir, size }] }`

### grep

Busca texto en archivos usando regex.

| Argumento | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `pattern` | string | sí | Patrón regex a buscar |
| `path` | string | no | Directorio base de búsqueda |
| `glob` | string | no | Patrón glob para filtrar archivos |
| `max_results` | number | no | Límite de resultados |

**Resultado:** `{ matches: [{ file, line_number, text }] }`

### screenshot

Captura una región de la pantalla.

| Argumento | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `x` | number | no | Coordenada X |
| `y` | number | no | Coordenada Y |
| `w` | number | no | Ancho |
| `h` | number | no | Alto |

**Resultado:** `{ image, width, height }` — `image` es base64 PNG

### screen_info

Obtiene información de la pantalla.

**Argumentos:** ninguno

**Resultado:** `{ width, height, scale_factor }`

### clipboard_read

Lee el contenido del clipboard.

**Argumentos:** ninguno

**Resultado:** `{ text }`

### clipboard_write

Escribe texto al clipboard.

| Argumento | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `text` | string | sí | Texto a escribir |

**Resultado:** `{}`

### git_status

Ejecuta `git status` en un directorio.

| Argumento | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `cwd` | string | no | Directorio del repo |

**Resultado:** `{ output, exit_code }`

### git_log

Ejecuta `git log` con formato configurable.

| Argumento | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `cwd` | string | no | Directorio del repo |
| `max_count` | number | no | Máximo de commits |
| `format` | string | no | Formato de salida |

**Resultado:** `{ output, exit_code }`

### git_diff

Ejecuta `git diff` con opciones.

| Argumento | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `cwd` | string | no | Directorio del repo |
| `cached` | boolean | no | Mostrar staged changes |
| `ref1` | string | no | Referencia inicial |
| `ref2` | string | no | Referencia final |

**Resultado:** `{ output, exit_code }`

### process_list

Lista procesos del sistema.

| Argumento | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `filter` | string | no | Filtro por nombre |
| `max_results` | number | no | Límite de resultados |

**Resultado:** `{ processes: [{ pid, name, cpu_usage, memory_mb }], total }`

### process_kill

Termina un proceso por PID.

| Argumento | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `pid` | number | sí | PID del proceso |

**Resultado:** `boolean`

## Cómo agregar un tool nuevo

### Paso 1: Rust

Crear `src-tauri/src/tools/nuevo.rs`:

```rust
#[tauri::command]
pub async fn cu_nuevo_tool(arg1: String) -> Result<serde_json::Value, String> {
    // implementación
    Ok(serde_json::json!({ "result": "..." }))
}
```

Registrar en `src-tauri/src/tools/mod.rs`:

```rust
pub mod nuevo;
```

Registrar en `src-tauri/src/lib.rs` (invoke_handler):

```rust
tools::nuevo::cu_nuevo_tool,
```

### Paso 2: JavaScript

Crear `src/js/tools/nuevo.js`:

```javascript
const invoke = () => window.__TAURI__.core.invoke;

export const TOOLS = {
  nuevo_tool: async (args) => invoke()('cu_nuevo_tool', args),
};
```

Agregar spread en `src/js/tools/index.js`:

```javascript
import { TOOLS as nuevo } from './nuevo.js';
export const TOOL_MAP = { ...bash, ...files, ...nuevo };
```

### Paso 3: MCP

Crear `mcp-server/tools/nuevo.js`:

```javascript
import { z } from 'zod';

export function registerNuevoTools(server) {
  server.tool('nuevo_tool', { arg1: z.string() }, async ({ arg1 }) => {
    // implementación (Node.js, sin Tauri)
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });
}
```

Registrar en `mcp-server/index.js`:

```javascript
import { registerNuevoTools } from './tools/nuevo.js';
registerNuevoTools(server);
```

El dispatcher (`action-handler.js`) no se modifica — solo el registro en `TOOL_MAP`.

## MCP Server standalone

Server MCP independiente para usar los tools sin que deskcritter esté corriendo. Usa transporte stdio con `@modelcontextprotocol/sdk`.

### Configuración

```json
{
  "mcpServers": {
    "deskcritter": {
      "command": "node",
      "args": ["C:/ruta/a/deskcritter/mcp-server/index.js"]
    }
  }
}
```

### Tools registrados

El MCP server registra exactamente los mismos tools que el action handler: `bash`, `file_read`, `file_write`, `file_edit`, `file_list`, `grep`, `screenshot`, `screen_info`, `clipboard_read`, `clipboard_write`, `git_status`, `git_log`, `git_diff`, `process_list`, `process_kill`.

La implementación en MCP es nativa de Node.js (sin Tauri), usando las mismas APIs del sistema (`child_process`, `fs`, etc.).
