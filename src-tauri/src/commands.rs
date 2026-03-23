use sysinfo::System;
use std::fs::OpenOptions;
use std::io::Write;
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

/// Retorna la memoria disponible del sistema en MB
#[tauri::command]
pub fn get_free_memory_mb() -> u64 {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.available_memory() / (1024 * 1024)
}

/// Retorna true si estamos en modo debug (dev build o env DESKCRITTER_DEBUG=true)
#[tauri::command]
pub fn is_debug() -> bool {
    if cfg!(debug_assertions) {
        return true;
    }
    std::env::var("DESKCRITTER_DEBUG")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false)
}

/// Retorna la ruta del archivo de log
#[tauri::command]
pub fn get_log_path(app: tauri::AppHandle) -> String {
    _log_path(&app).to_string_lossy().to_string()
}

/// Escribe líneas de log al archivo debug.log (append)
#[tauri::command]
pub fn write_log(app: tauri::AppHandle, lines: String) {
    let log_path = _log_path(&app);

    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = file.write_all(lines.as_bytes());
    }
}

/// Registrar atajos globales Ctrl+Shift+<letra> (llamado desde JS)
#[tauri::command]
pub fn register_shortcuts(app: tauri::AppHandle, keys: Vec<String>) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;

    let mods = Some(Modifiers::CONTROL | Modifiers::SHIFT);
    for key in &keys {
        let code = match key.to_uppercase().as_str() {
            "A" => Code::KeyA, "B" => Code::KeyB, "C" => Code::KeyC,
            "D" => Code::KeyD, "E" => Code::KeyE, "F" => Code::KeyF,
            "G" => Code::KeyG, "H" => Code::KeyH, "I" => Code::KeyI,
            "J" => Code::KeyJ, "K" => Code::KeyK, "L" => Code::KeyL,
            "M" => Code::KeyM, "N" => Code::KeyN, "O" => Code::KeyO,
            "P" => Code::KeyP, "Q" => Code::KeyQ, "R" => Code::KeyR,
            "S" => Code::KeyS, "T" => Code::KeyT, "U" => Code::KeyU,
            "V" => Code::KeyV, "W" => Code::KeyW, "X" => Code::KeyX,
            "Y" => Code::KeyY, "Z" => Code::KeyZ,
            _ => continue,
        };
        gs.register(Shortcut::new(mods, code)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn _log_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir()
        .map(|p| p.join("debug.log"))
        .unwrap_or_else(|_| std::path::PathBuf::from("debug.log"))
}
