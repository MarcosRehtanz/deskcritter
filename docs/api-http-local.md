# API HTTP local

Servidor HTTP embebido en Rust (`tiny_http`) que permite controlar deskcritter desde otras aplicaciones locales.

## Activación

Deshabilitada por default. Para activar:

- `localApiEnabled: true` en la configuración
- `localApiPort: 17842` (puerto configurable)

El servidor se inicia desde el frontend llamando al comando Tauri `start_local_api`, que genera un token Bearer aleatorio (UUID v4) y arranca el hilo HTTP.

## Seguridad

- Escucha **solo en localhost** (`127.0.0.1`): no accesible desde la red
- **Autenticación Bearer token**: todos los endpoints (excepto `/status`) requieren el header `Authorization: Bearer <token>`
- El token se genera al arrancar y es único por sesión
- Límite de body: 1 MB (`MAX_BODY_SIZE`)

## Endpoints

### `GET /status`

Estado del servidor. **No requiere autenticación.**

```bash
curl http://localhost:17842/status
```

**Respuesta:**
```json
{
  "status": "running",
  "version": "0.1.0"
}
```

### `POST /message`

Envía un mensaje de texto al monigote (como si el usuario lo hubiera escrito).

```bash
curl -X POST http://localhost:17842/message \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hola desde otra app"}'
```

**Respuesta:**
```json
{"ok": true}
```

**Evento emitido al frontend:** `http-api:message` con `{ text }`

### `POST /action`

Envía una acción (tool) para ejecutar.

```bash
curl -X POST http://localhost:17842/action \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"id": "uuid", "tool": "bash", "args": {"command": "dir"}}'
```

**Respuesta:**
```json
{"ok": true}
```

**Evento emitido al frontend:** `http-api:action` con el JSON completo

### `POST /webhook`

Recibe un webhook genérico.

```bash
curl -X POST http://localhost:17842/webhook \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"event": "deploy_complete", "data": {"status": "success"}}'
```

**Respuesta:**
```json
{"ok": true}
```

**Evento emitido al frontend:** `http-api:webhook` con el JSON completo

## Errores

| Código | Cuerpo | Causa |
|--------|--------|-------|
| 401 | `{"error":"Unauthorized"}` | Token faltante o inválido |
| 400 | `{"error":"JSON inválido"}` | Body no es JSON válido |
| 404 | `{"error":"Not found"}` | Endpoint no existe |

## CORS

El servidor responde a preflight `OPTIONS` con los headers necesarios:
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

No incluye `Access-Control-Allow-Origin` ya que está diseñado solo para uso desde localhost.

## Eventos en el frontend

Los mensajes recibidos por la API HTTP se emiten como eventos Tauri y se escuchan en el frontend:

| Evento | Payload | Uso |
|--------|---------|-----|
| `http-api:message` | `{ text }` | Se procesa como input del usuario |
| `http-api:action` | `{ id, tool, args }` | Se despacha al action handler |
| `http-api:webhook` | `{ event, data, ... }` | Se procesa según el contenido |

## Arquitectura

```
App externa
  → HTTP POST localhost:17842/message
  → tiny_http (Rust, hilo separado)
  → app.emit("http-api:message", payload)
  → Tauri event bridge
  → Frontend JS (EventBus)
  → Procesamiento normal (burbuja, server, etc.)
```

El servidor HTTP corre en un hilo dedicado con un loop de `recv_timeout(1s)`, lo que permite verificar el flag de shutdown periódicamente. Solo se puede arrancar una vez por sesión (protegido por `AtomicBool`).
