# Plugins

Sistema de extensiones que permite agregar animaciones, estados FSM y lógica personalizada al monigote.

## Activación

El sistema de plugins está deshabilitado por default. Para activarlo:

- `pluginsEnabled: true` en la configuración
- `pluginsDir: "plugins/"` — directorio donde se buscan los plugins (relativo al directorio de la app)

## Estructura de un plugin

Cada plugin es un subdirectorio dentro de `pluginsDir/` con un manifiesto `plugin.json`:

```
plugins/
└── mi-plugin/
    ├── plugin.json       # Manifiesto (requerido)
    └── init.js           # Script de inicialización (opcional)
```

### Manifiesto (`plugin.json`)

```json
{
  "name": "Mi Plugin",
  "version": "1.0.0",
  "description": "Descripción del plugin",
  "init": "init.js",
  "animations": {
    "dance": {
      "row": 10,
      "frameCount": 4,
      "frameDuration": 150
    }
  },
  "states": {
    "dancing": {
      "animation": "dance",
      "minDuration": 3000,
      "maxDuration": 5000,
      "transitions": [
        { "to": "idle", "weight": 10 }
      ]
    }
  }
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `name` | string | sí | Nombre del plugin |
| `version` | string | sí | Versión semántica |
| `description` | string | no | Descripción |
| `init` | string | no | Ruta al script de inicialización (relativa al dir del plugin) |
| `animations` | object | no | Animaciones custom a registrar en el sprite |
| `states` | object | no | Estados FSM custom a registrar |

### Animaciones

Cada animación define una fila del sprite sheet:

```json
{
  "row": 10,
  "frameCount": 4,
  "frameDuration": 200
}
```

- `row` — fila del sprite sheet (0-indexed)
- `frameCount` — cantidad de frames en la fila
- `frameDuration` — milisegundos por frame

### Estados FSM

Cada estado sigue el formato de la FSM genérica:

```json
{
  "animation": "dance",
  "minDuration": 3000,
  "maxDuration": 5000,
  "transitions": [
    { "to": "idle", "weight": 10 },
    { "to": "dancing", "weight": 2 }
  ]
}
```

## API para plugins

El script `init.js` recibe un objeto `api` con acceso limitado:

```javascript
// init.js — recibe el objeto api como argumento
(function(api) {

  // Escuchar eventos del EventBus
  api.on('server:done', ({ text }) => {
    console.log('Respuesta completa:', text);
  });

  // Emitir eventos al EventBus
  api.emit('mi-plugin:ready', { version: '1.0.0' });

  // Leer configuración
  const lang = api.getConfig('whisperLang');

})
```

### Métodos disponibles

| Método | Descripción |
|--------|-------------|
| `api.on(event, callback)` | Suscribirse a un evento del EventBus |
| `api.emit(event, data)` | Emitir un evento al EventBus |
| `api.getConfig(key)` | Leer un valor de configuración |

### Restricciones

- El script se ejecuta con `new Function()` (no tiene acceso al scope del módulo)
- Timeout de 5 segundos para la inicialización
- No tiene acceso directo a Tauri, DOM, ni otros módulos
- Los errores de sintaxis o timeout se loguean pero no detienen la carga de otros plugins

## Carga dinámica

El `plugin-loader.js` ejecuta el siguiente proceso al arrancar:

1. Verificar que `pluginsEnabled` sea `true`
2. Listar subdirectorios en `pluginsDir` vía `cu_file_list`
3. Para cada subdirectorio:
   a. Leer `plugin.json` vía `cu_file_read`
   b. Validar que tenga `name` y `version`
   c. Registrar animaciones custom en el sprite
   d. Registrar estados FSM custom
   e. Ejecutar `init.js` si existe (con timeout de 5s)
4. Almacenar el plugin en la lista interna

### Consultar plugins cargados

```javascript
import { getPlugins, getPluginCount } from './plugin-loader.js';

const plugins = getPlugins();     // [{id, name, version, description, enabled, manifest}]
const count = getPluginCount();   // número de plugins cargados
```

## Ejemplo: plugin mínimo

### `plugins/saludo/plugin.json`

```json
{
  "name": "Saludo",
  "version": "1.0.0",
  "description": "Saluda cuando se conecta al server",
  "init": "init.js"
}
```

### `plugins/saludo/init.js`

```javascript
(function(api) {
  api.on('server:connected', () => {
    api.emit('bubble:show');
    console.log('[Saludo] Conectado al server');
  });
})
```
