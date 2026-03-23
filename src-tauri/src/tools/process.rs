use serde::Serialize;
use sysinfo::System;

#[derive(Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_mb: f64,
}

#[derive(Serialize)]
pub struct ProcessListResult {
    pub processes: Vec<ProcessInfo>,
    pub total: usize,
}

/// Lista procesos del sistema
#[tauri::command]
pub async fn cu_process_list(
    filter: Option<String>,
    max_results: Option<usize>,
) -> Result<ProcessListResult, String> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let max = max_results.unwrap_or(50);
    let mut processes: Vec<ProcessInfo> = sys.processes().iter()
        .filter(|(_, p)| {
            if let Some(ref f) = filter {
                p.name().to_string_lossy().to_lowercase().contains(&f.to_lowercase())
            } else {
                true
            }
        })
        .map(|(pid, p)| ProcessInfo {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().to_string(),
            cpu_usage: p.cpu_usage(),
            memory_mb: p.memory() as f64 / 1024.0 / 1024.0,
        })
        .collect();

    // Ordenar por uso de memoria descendente
    processes.sort_by(|a, b| b.memory_mb.partial_cmp(&a.memory_mb).unwrap_or(std::cmp::Ordering::Equal));

    let total = processes.len();
    processes.truncate(max);

    Ok(ProcessListResult { processes, total })
}

/// Termina un proceso por PID
#[tauri::command]
pub async fn cu_process_kill(pid: u32) -> Result<bool, String> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let pid = sysinfo::Pid::from_u32(pid);
    if let Some(process) = sys.process(pid) {
        Ok(process.kill())
    } else {
        Err(format!("Proceso con PID {} no encontrado", pid))
    }
}
