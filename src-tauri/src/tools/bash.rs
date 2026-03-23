use serde::Serialize;
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

#[derive(Serialize)]
pub struct BashResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// Ejecuta un comando en el shell nativo del OS y retorna stdout/stderr/exit_code
#[tauri::command]
pub async fn cu_bash(
    command: String,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<BashResult, String> {
    let timeout_dur = Duration::from_millis(timeout_ms.unwrap_or(60_000));

    let mut cmd = {
        #[cfg(target_os = "windows")]
        {
            let mut c = Command::new("powershell");
            c.args(["-NoProfile", "-Command", &command]);
            c
        }
        #[cfg(not(target_os = "windows"))]
        {
            let mut c = Command::new("sh");
            c.args(["-c", &command]);
            c
        }
    };

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    let output = timeout(timeout_dur, cmd.output())
        .await
        .map_err(|_| format!("Timeout después de {}ms", timeout_dur.as_millis()))?
        .map_err(|e| format!("Error ejecutando comando: {}", e))?;

    Ok(BashResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}
