# Instalación y desarrollo

## Requisitos

- **Node.js** ≥ 18
- **Rust** toolchain (rustup, cargo) — edición 2021, mínimo Rust 1.77.2
- **Tauri CLI** v2 — se instala con las dependencias de npm
- **Dependencias del sistema** según la plataforma (ver abajo)

### Windows

- Microsoft Visual Studio C++ Build Tools
- WebView2 (incluido en Windows 10/11)

### Linux

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### macOS

- Xcode Command Line Tools: `xcode-select --install`

## Setup

```bash
# Clonar el repositorio
git clone https://github.com/MarcosRehtanz/deskcritter.git
cd deskcritter

# Instalar dependencias de npm (Tauri CLI + API)
npm install

# Instalar dependencias del MCP server (opcional)
cd mcp-server && npm install && cd ..
```

## Desarrollo

```bash
# Modo desarrollo con debug habilitado
npm run dev

# Modo desarrollo sin debug
npm run dev:quiet
```

`npm run dev` establece `DESKCRITTER_DEBUG=true` y ejecuta `tauri dev`, que:
1. Compila el backend Rust en modo debug
2. Sirve el frontend desde `src/`
3. Abre la ventana con DevTools disponible

### Variable de entorno

- `DESKCRITTER_DEBUG=true` — activa el sistema de debug (logs en consola, archivo de log, indicadores visuales)

## Build de producción

```bash
npm run build
```

Genera el instalador en `src-tauri/target/release/bundle/`.

## Configuración del MCP server

Para usar los tools de deskcritter desde terminal-live u otro cliente MCP sin necesidad de que deskcritter esté corriendo:

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

El MCP server usa transporte stdio y expone los mismos tools que el action handler (bash, files, grep, screen, clipboard, git, process). Ver [Tools y acciones](tools-y-acciones.md).

## Scripts de npm

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Desarrollo con debug (`DESKCRITTER_DEBUG=true`) |
| `npm run dev:quiet` | Desarrollo sin debug |
| `npm run build` | Build de producción |
| `npm run tauri` | Ejecutar Tauri CLI directamente |

## Dependencias principales

### Frontend (npm)

| Paquete | Uso |
|---------|-----|
| `@tauri-apps/api` | Bridge JS ↔ Rust |
| `@tauri-apps/cli` | CLI de Tauri (dev dependency) |
| `@tauri-apps/plugin-global-shortcut` | Atajos globales de teclado |

### Backend (Cargo)

| Crate | Uso |
|-------|-----|
| `tauri` | Framework de aplicación (con tray-icon) |
| `tauri-plugin-sql` | SQLite (con feature sqlite) |
| `tauri-plugin-global-shortcut` | Atajos globales |
| `tauri-plugin-log` | Logging (solo en debug) |
| `sysinfo` | Información del sistema (RAM, procesos) |
| `xcap` | Captura de pantalla |
| `arboard` | Acceso al clipboard |
| `tiny_http` | Servidor HTTP local |
| `tokio` | Async runtime (para procesos y timeouts) |
| `walkdir` | Recorrido de directorios |
| `regex` / `glob` | Búsqueda de archivos y texto |
| `image` | Procesamiento de imágenes (screenshots) |
| `base64` | Codificación de screenshots |
| `uuid` | Generación de tokens (HTTP API) |

### CDN (runtime, sin bundler)

| Librería | Uso |
|----------|-----|
| `@huggingface/transformers@3.8.1` | Whisper ONNX en WASM para STT |
