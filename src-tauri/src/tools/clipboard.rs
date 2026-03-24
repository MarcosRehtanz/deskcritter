use arboard::Clipboard;

/// Lee texto del portapapeles
#[tauri::command]
pub fn cu_clipboard_read() -> Result<String, String> {
    let mut clipboard = Clipboard::new()
        .map_err(|e| format!("Error abriendo clipboard: {}", e))?;
    clipboard.get_text()
        .map_err(|e| format!("Error leyendo clipboard: {}", e))
}

/// Escribe texto al portapapeles
#[tauri::command]
pub fn cu_clipboard_write(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new()
        .map_err(|e| format!("Error abriendo clipboard: {}", e))?;
    clipboard.set_text(&text)
        .map_err(|e| format!("Error escribiendo clipboard: {}", e))
}
