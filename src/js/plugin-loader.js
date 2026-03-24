// Cargador de plugins — escanea directorio de plugins y carga manifiestos
import { eventBus } from './event-bus.js';
import * as config from './config.js';
import { dbg } from './debug.js';

let _plugins = [];

/**
 * Carga los plugins desde el directorio configurado.
 * Cada plugin debe tener un plugin.json con: name, version, description
 * y opcionalmente: init (función), events (lista de eventos que escucha)
 */
export async function loadPlugins(sprite, fsm) {
  if (config.get('pluginsEnabled') !== true) {
    dbg('plugins', 'sistema de plugins deshabilitado');
    return;
  }

  const pluginsDir = config.get('pluginsDir') || 'plugins/';
  dbg('plugins', 'cargando plugins desde', pluginsDir);

  try {
    // Leer directorio de plugins via Tauri
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) {
      dbg('plugins', 'Tauri no disponible, saltando plugins');
      return;
    }

    const result = await invoke('cu_file_list', { path: pluginsDir });
    const dirs = result.entries.filter(e => e.is_dir);

    for (const dir of dirs) {
      try {
        const manifestPath = `${pluginsDir}${dir.name}/plugin.json`;
        const manifestResult = await invoke('cu_file_read', { path: manifestPath });
        const manifest = JSON.parse(manifestResult.content);

        if (!manifest.name || !manifest.version) {
          dbg('plugins', `plugin ${dir.name} sin name/version, saltando`);
          continue;
        }

        const plugin = {
          id: dir.name,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description || '',
          enabled: true,
          manifest,
        };

        // Cargar animaciones custom del plugin
        if (manifest.animations && sprite) {
          for (const [name, anim] of Object.entries(manifest.animations)) {
            sprite.addAnimation(name, anim.row, anim.frameCount, anim.frameDuration || 200);
            dbg('plugins', `animación ${name} registrada desde plugin ${manifest.name}`);
          }
        }

        // Cargar estados FSM custom del plugin
        if (manifest.states && fsm) {
          for (const [name, state] of Object.entries(manifest.states)) {
            fsm.addState(name, state);
            dbg('plugins', `estado ${name} registrado desde plugin ${manifest.name}`);
          }
        }

        // Cargar script init del plugin (si existe)
        if (manifest.init) {
          try {
            const initPath = `${pluginsDir}${dir.name}/${manifest.init}`;
            const initResult = await invoke('cu_file_read', { path: initPath });
            // Ejecutar en sandbox limitado con acceso al eventBus
            const pluginApi = {
              on: (event, fn) => eventBus.on(event, fn),
              emit: (event, data) => eventBus.emit(event, data),
              getConfig: (key) => config.get(key),
            };
            let fn;
            try {
              fn = new Function('api', initResult.content);
            } catch (syntaxErr) {
              dbg('plugins', `error de sintaxis en init de ${manifest.name}:`, syntaxErr.message);
              continue;
            }
            // Ejecutar con timeout de 5s
            const PLUGIN_TIMEOUT = 5000;
            const result = fn(pluginApi);
            if (result && typeof result.then === 'function') {
              await Promise.race([
                result,
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('timeout')), PLUGIN_TIMEOUT)
                ),
              ]);
            }
            dbg('plugins', `init ejecutado para plugin ${manifest.name}`);
          } catch (e) {
            dbg('plugins', `error ejecutando init de ${manifest.name}:`, e.message || e);
          }
        }

        _plugins.push(plugin);
        dbg('plugins', `plugin cargado: ${manifest.name} v${manifest.version}`);
      } catch (e) {
        dbg('plugins', `error cargando plugin ${dir.name}:`, e);
      }
    }

    dbg('plugins', `${_plugins.length} plugins cargados`);
  } catch (e) {
    dbg('plugins', 'error listando directorio de plugins:', e);
  }
}

export function getPlugins() {
  return [..._plugins];
}

export function getPluginCount() {
  return _plugins.length;
}
