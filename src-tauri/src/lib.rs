mod commands;
mod tools;
mod http_api;

use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{WebviewWindowBuilder, WebviewUrl, Emitter};
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let migrations = vec![
    Migration {
      version: 1,
      description: "crear tablas config y characters",
      sql: "CREATE TABLE IF NOT EXISTS config (
              key   TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS characters (
              id        INTEGER PRIMARY KEY AUTOINCREMENT,
              name      TEXT NOT NULL UNIQUE,
              sprite    TEXT NOT NULL,
              is_active INTEGER DEFAULT 0
            );",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "crear tabla messages para historial de chat",
      sql: "CREATE TABLE IF NOT EXISTS messages (
              id         INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              role       TEXT NOT NULL,
              text       TEXT NOT NULL,
              timestamp  INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);",
      kind: MigrationKind::Up,
    },
  ];

  tauri::Builder::default()
    .plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
          let mods = Some(Modifiers::CONTROL | Modifiers::SHIFT);
          // Soportar todas las letras A-Z para atajos configurables
          let all_keys: &[(Code, &str)] = &[
            (Code::KeyA, "A"), (Code::KeyB, "B"), (Code::KeyC, "C"),
            (Code::KeyD, "D"), (Code::KeyE, "E"), (Code::KeyF, "F"),
            (Code::KeyG, "G"), (Code::KeyH, "H"), (Code::KeyI, "I"),
            (Code::KeyJ, "J"), (Code::KeyK, "K"), (Code::KeyL, "L"),
            (Code::KeyM, "M"), (Code::KeyN, "N"), (Code::KeyO, "O"),
            (Code::KeyP, "P"), (Code::KeyQ, "Q"), (Code::KeyR, "R"),
            (Code::KeyS, "S"), (Code::KeyT, "T"), (Code::KeyU, "U"),
            (Code::KeyV, "V"), (Code::KeyW, "W"), (Code::KeyX, "X"),
            (Code::KeyY, "Y"), (Code::KeyZ, "Z"),
          ];
          for &(code, label) in all_keys {
            if shortcut == &Shortcut::new(mods, code) {
              let state = match event.state() {
                ShortcutState::Pressed => "Pressed",
                ShortcutState::Released => "Released",
              };
              let _ = app.emit("global-shortcut", serde_json::json!({ "key": label, "state": state }));
              break;
            }
          }
        })
        .build(),
    )
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:deskcritter.db", migrations)
        .build(),
    )
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Desactivar sombra de ventana (elimina borde en Windows)
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_shadow(false);
      }

      // Iniciar API HTTP local si está configurado
      // Por ahora arranca siempre en el puerto default; la config se lee desde JS
      // y se puede deshabilitar desde el panel de configuración
      let app_handle = app.handle().clone();
      std::thread::spawn(move || {
        // Pequeño delay para que la app arranque primero
        std::thread::sleep(std::time::Duration::from_secs(2));
        http_api::start_http_api(app_handle, 17842);
      });

      // Los atajos globales se registran desde JS via register_shortcuts

      // Icono en bandeja del sistema
      let config_item = MenuItemBuilder::with_id("config", "Configuración").build(app)?;
      let reconnect_item = MenuItemBuilder::with_id("reconnect", "Reconectar").build(app)?;
      let toggle_item = MenuItemBuilder::with_id("toggle_visibility", "Ocultar/Mostrar").build(app)?;
      let quit_item = MenuItemBuilder::with_id("quit", "Salir").build(app)?;
      let menu = MenuBuilder::new(app)
        .item(&config_item)
        .item(&reconnect_item)
        .item(&toggle_item)
        .item(&quit_item)
        .build()?;

      let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app_handle, event| {
          match event.id().as_ref() {
            "config" => {
              // Si la ventana config ya existe, enfocarla
              if let Some(win) = app_handle.get_webview_window("config") {
                let _ = win.set_focus();
              } else {
                // Crear ventana de configuración
                let _win = WebviewWindowBuilder::new(
                  app_handle,
                  "config",
                  WebviewUrl::App("config.html".into()),
                )
                .title("Configuración — DeskCritter")
                .inner_size(900.0, 600.0)
                .decorations(false)
                .center()
                .build();
              }
            }
            "reconnect" => {
              let _ = app_handle.emit("tray:reconnect", ());
            }
            "toggle_visibility" => {
              if let Some(win) = app_handle.get_webview_window("main") {
                if win.is_visible().unwrap_or(true) {
                  let _ = win.hide();
                } else {
                  let _ = win.show();
                }
              }
            }
            "quit" => {
              app_handle.exit(0);
            }
            _ => {}
          }
        })
        .build(app)?;

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::get_free_memory_mb,
      commands::is_debug,
      commands::write_log,
      commands::get_log_path,
      commands::register_shortcuts,
      tools::bash::cu_bash,
      tools::files::cu_file_read,
      tools::files::cu_file_write,
      tools::files::cu_file_edit,
      tools::files::cu_file_list,
      tools::grep::cu_grep,
      tools::screen::cu_screenshot,
      tools::screen::cu_screen_info,
      tools::clipboard::cu_clipboard_read,
      tools::clipboard::cu_clipboard_write,
      tools::git::cu_git_status,
      tools::git::cu_git_log,
      tools::git::cu_git_diff,
      tools::process::cu_process_list,
      tools::process::cu_process_kill,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
