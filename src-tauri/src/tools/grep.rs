use serde::Serialize;
use regex::Regex;
use std::fs;
use walkdir::WalkDir;

#[derive(Serialize)]
pub struct GrepMatch {
    pub file: String,
    pub line_number: usize,
    pub text: String,
}

/// Busca un patrón regex recursivamente en archivos
#[tauri::command]
pub fn cu_grep(
    pattern: String,
    path: Option<String>,
    glob_filter: Option<String>,
    max_results: Option<usize>,
) -> Result<Vec<GrepMatch>, String> {
    let re = Regex::new(&pattern)
        .map_err(|e| format!("Regex inválida: {}", e))?;

    let root = path.unwrap_or_else(|| ".".to_string());
    let max = max_results.unwrap_or(50);

    let glob_pat = glob_filter.as_ref().map(|g| {
        glob::Pattern::new(g).ok()
    }).flatten();

    let mut matches = Vec::new();

    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let file_name = entry.file_name().to_string_lossy();

        // Filtrar por glob si se especificó
        if let Some(ref pat) = glob_pat {
            if !pat.matches(&file_name) {
                continue;
            }
        }

        // Saltar archivos binarios (intento de lectura como texto)
        let content = match fs::read_to_string(entry.path()) {
            Ok(c) => c,
            Err(_) => continue,
        };

        for (i, line) in content.lines().enumerate() {
            if re.is_match(line) {
                matches.push(GrepMatch {
                    file: entry.path().to_string_lossy().to_string(),
                    line_number: i + 1,
                    text: line.to_string(),
                });
                if matches.len() >= max {
                    return Ok(matches);
                }
            }
        }
    }

    Ok(matches)
}
