use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::thread;
use std::io::Read;
use tiny_http::{Server, Response, Header, Method};
use tauri::{AppHandle, Emitter};

/// Límite de body: 1MB
const MAX_BODY_SIZE: usize = 1_048_576;

/// Inicia el servidor HTTP local en un hilo separado (solo localhost + token auth)
pub fn start_http_api(app: AppHandle, port: u16, token: String) -> Arc<AtomicBool> {
    let running = Arc::new(AtomicBool::new(true));
    let running_clone = running.clone();

    thread::spawn(move || {
        let addr = format!("127.0.0.1:{}", port);
        let server = match Server::http(&addr) {
            Ok(s) => s,
            Err(e) => {
                log::error!("No se pudo iniciar HTTP API en {}: {}", addr, e);
                return;
            }
        };
        log::info!("HTTP API escuchando en {}", addr);

        while running_clone.load(Ordering::Relaxed) {
            // Timeout de 1s para poder verificar el flag de running
            let mut request = match server.recv_timeout(std::time::Duration::from_secs(1)) {
                Ok(Some(r)) => r,
                Ok(None) => continue,
                Err(_) => break,
            };

            let cors_methods = Header::from_bytes("Access-Control-Allow-Methods", "GET, POST, OPTIONS").unwrap();
            let cors_headers = Header::from_bytes("Access-Control-Allow-Headers", "Content-Type, Authorization").unwrap();
            let content_type = Header::from_bytes("Content-Type", "application/json").unwrap();

            let path = request.url().split('?').next().unwrap_or("/").to_string();
            let method = request.method().clone();

            // Manejar preflight CORS (sin CORS origin header — solo localhost lo necesita)
            if matches!(method, Method::NonStandard(_)) && request.method().as_str() == "OPTIONS" {
                let resp = Response::empty(200)
                    .with_header(cors_methods)
                    .with_header(cors_headers);
                let _ = request.respond(resp);
                continue;
            }

            // /status no requiere autenticación
            if path == "/status" && matches!(method, Method::Get) {
                let body = serde_json::json!({
                    "status": "running",
                    "version": env!("CARGO_PKG_VERSION"),
                });
                let resp = Response::from_string(body.to_string())
                    .with_header(content_type);
                let _ = request.respond(resp);
                continue;
            }

            // Validar token en todos los demás endpoints
            let expected_auth = format!("Bearer {}", token);
            let auth_valid = request.headers().iter().any(|h| {
                h.field.as_str() == "Authorization"
                    && h.value.as_str() == expected_auth
            });

            if !auth_valid {
                let resp = Response::from_string(r#"{"error":"Unauthorized"}"#)
                    .with_status_code(401)
                    .with_header(content_type);
                let _ = request.respond(resp);
                continue;
            }

            match (&method, path.as_str()) {
                (Method::Post, "/message") => {
                    let mut body = String::new();
                    let _ = request.as_reader().take(MAX_BODY_SIZE as u64).read_to_string(&mut body);
                    match serde_json::from_str::<serde_json::Value>(&body) {
                        Ok(json) => {
                            let text = json.get("text").and_then(|v| v.as_str()).unwrap_or("");
                            let _ = app.emit("http-api:message", serde_json::json!({ "text": text }));
                            let resp = Response::from_string(r#"{"ok":true}"#)
                                .with_header(content_type.clone());
                            let _ = request.respond(resp);
                        }
                        Err(_) => {
                            let resp = Response::from_string(r#"{"error":"JSON inválido"}"#)
                                .with_status_code(400)
                                .with_header(content_type);
                            let _ = request.respond(resp);
                        }
                    }
                }

                (Method::Post, "/action") => {
                    let mut body = String::new();
                    let _ = request.as_reader().take(MAX_BODY_SIZE as u64).read_to_string(&mut body);
                    match serde_json::from_str::<serde_json::Value>(&body) {
                        Ok(json) => {
                            let _ = app.emit("http-api:action", json);
                            let resp = Response::from_string(r#"{"ok":true}"#)
                                .with_header(content_type.clone());
                            let _ = request.respond(resp);
                        }
                        Err(_) => {
                            let resp = Response::from_string(r#"{"error":"JSON inválido"}"#)
                                .with_status_code(400)
                                .with_header(content_type);
                            let _ = request.respond(resp);
                        }
                    }
                }

                (Method::Post, "/webhook") => {
                    let mut body = String::new();
                    let _ = request.as_reader().take(MAX_BODY_SIZE as u64).read_to_string(&mut body);
                    match serde_json::from_str::<serde_json::Value>(&body) {
                        Ok(json) => {
                            let _ = app.emit("http-api:webhook", json);
                            let resp = Response::from_string(r#"{"ok":true}"#)
                                .with_header(content_type.clone());
                            let _ = request.respond(resp);
                        }
                        Err(_) => {
                            let resp = Response::from_string(r#"{"error":"JSON inválido"}"#)
                                .with_status_code(400)
                                .with_header(content_type);
                            let _ = request.respond(resp);
                        }
                    }
                }

                _ => {
                    let resp = Response::from_string(r#"{"error":"Not found"}"#)
                        .with_status_code(404)
                        .with_header(content_type);
                    let _ = request.respond(resp);
                }
            }
        }
    });

    running
}
