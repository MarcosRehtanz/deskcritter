use serde::Serialize;
use std::process::Stdio;
use tokio::process::Command;

#[derive(Serialize)]
pub struct GitResult {
    pub output: String,
    pub exit_code: i32,
}

async fn run_git(args: &[&str], cwd: Option<&str>) -> Result<GitResult, String> {
    let mut cmd = Command::new("git");
    cmd.args(args);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let output = cmd.output().await
        .map_err(|e| format!("Error ejecutando git: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = if stderr.is_empty() {
        stdout.to_string()
    } else {
        format!("{}\n{}", stdout, stderr)
    };
    Ok(GitResult {
        output: combined,
        exit_code: output.status.code().unwrap_or(-1),
    })
}

/// Estado del repositorio git
#[tauri::command]
pub async fn cu_git_status(cwd: Option<String>) -> Result<GitResult, String> {
    run_git(&["status", "--porcelain=v1", "-b"], cwd.as_deref()).await
}

/// Log de commits recientes
#[tauri::command]
pub async fn cu_git_log(
    cwd: Option<String>,
    max_count: Option<u32>,
    format: Option<String>,
) -> Result<GitResult, String> {
    let count = max_count.unwrap_or(20).to_string();
    let fmt = format.unwrap_or_else(|| "%h %s (%an, %ar)".to_string());
    run_git(
        &["log", &format!("--max-count={}", count), &format!("--format={}", fmt)],
        cwd.as_deref(),
    ).await
}

/// Diff del working tree o entre refs
#[tauri::command]
pub async fn cu_git_diff(
    cwd: Option<String>,
    cached: Option<bool>,
    ref1: Option<String>,
    ref2: Option<String>,
) -> Result<GitResult, String> {
    let mut args = vec!["diff"];
    if cached.unwrap_or(false) {
        args.push("--cached");
    }
    // Necesitamos mantener las Strings vivas
    let r1;
    let r2;
    if let Some(r) = &ref1 {
        r1 = r.clone();
        args.push(&r1);
    }
    if let Some(r) = &ref2 {
        r2 = r.clone();
        args.push(&r2);
    }
    run_git(&args, cwd.as_deref()).await
}
