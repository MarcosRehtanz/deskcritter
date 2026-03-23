use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Serialize)]
pub struct FileReadResult {
    pub content: String,
}

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

/// Lee un archivo con offset/limit opcionales (líneas)
/// Usa BufReader cuando hay offset/limit para evitar cargar todo en memoria
#[tauri::command]
pub fn cu_file_read(
    path: String,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<FileReadResult, String> {
    // Si hay offset o limit, usar BufReader + skip/take sin cargar todo
    if offset.is_some() || limit.is_some() {
        let file = fs::File::open(&path)
            .map_err(|e| format!("Error leyendo {}: {}", path, e))?;
        let reader = BufReader::new(file);
        let skip = offset.unwrap_or(0);
        let lines: Vec<String> = if let Some(lim) = limit {
            reader.lines()
                .skip(skip)
                .take(lim)
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Error leyendo {}: {}", path, e))?
        } else {
            reader.lines()
                .skip(skip)
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Error leyendo {}: {}", path, e))?
        };
        return Ok(FileReadResult { content: lines.join("\n") });
    }

    // Sin offset/limit: leer todo directamente
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Error leyendo {}: {}", path, e))?;
    Ok(FileReadResult { content })
}

/// Escribe contenido a un archivo, creando directorios padres si es necesario
#[tauri::command]
pub fn cu_file_write(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Error creando directorio: {}", e))?;
    }
    fs::write(&path, &content)
        .map_err(|e| format!("Error escribiendo {}: {}", path, e))?;
    Ok(())
}

/// Reemplaza old_string por new_string en un archivo (exacto, una ocurrencia)
#[tauri::command]
pub fn cu_file_edit(
    path: String,
    old_string: String,
    new_string: String,
) -> Result<(), String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Error leyendo {}: {}", path, e))?;

    let count = content.matches(&old_string).count();
    if count == 0 {
        return Err(format!("old_string no encontrado en {}", path));
    }
    if count > 1 {
        return Err(format!("old_string tiene {} ocurrencias en {} (debe ser única)", count, path));
    }

    let new_content = content.replacen(&old_string, &new_string, 1);
    fs::write(&path, &new_content)
        .map_err(|e| format!("Error escribiendo {}: {}", path, e))?;
    Ok(())
}

/// Lista archivos en un directorio, con filtro glob opcional
#[tauri::command]
pub fn cu_file_list(
    path: String,
    pattern: Option<String>,
) -> Result<Vec<FileEntry>, String> {
    let entries = fs::read_dir(&path)
        .map_err(|e| format!("Error leyendo directorio {}: {}", path, e))?;

    let glob_pattern = pattern.as_ref().map(|p| {
        glob::Pattern::new(p).ok()
    }).flatten();

    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Error iterando: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();

        if let Some(ref pat) = glob_pattern {
            if !pat.matches(&name) {
                continue;
            }
        }

        let metadata = entry.metadata()
            .map_err(|e| format!("Error metadata: {}", e))?;

        result.push(FileEntry {
            name,
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
    }

    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}
