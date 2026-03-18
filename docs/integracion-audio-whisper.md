# Integración de audio: Whisper y reconocimiento de voz

## Visión general
El monigote puede escuchar al usuario a través del micrófono, transcribir el audio a texto usando modelos de reconocimiento de voz (Whisper), y responder con acciones o diálogos. El usuario puede elegir qué backend y modelo utilizar según sus necesidades y hardware.

---

## 1. Backends disponibles

### Opción A: whisper.cpp nativo (recomendado)
Integración directa en Rust usando el crate `whisper-rs`, que envuelve whisper.cpp. Corre embebido en la app sin dependencias externas.

**Ventajas:** sin instalaciones extras, funciona offline, buen rendimiento en CPU
**Desventaja:** los modelos grandes requieren buena cantidad de RAM

```toml
# Cargo.toml
[dependencies]
whisper-rs = "0.12"
```

```rust
use whisper_rs::{WhisperContext, WhisperParams, SamplingStrategy};

#[tauri::command]
fn transcribir_audio(ruta_audio: String, modelo: String) -> Result<String, String> {
    let ctx = WhisperContext::new(&modelo)
        .map_err(|e| format!("Error cargando modelo: {}", e))?;

    let mut params = WhisperParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some("es"));

    let mut state = ctx.create_state()
        .map_err(|e| format!("Error creando estado: {}", e))?;

    // Cargar audio PCM 16kHz mono
    let audio_data = cargar_audio_pcm(&ruta_audio)?;

    state.full(params, &audio_data)
        .map_err(|e| format!("Error en transcripción: {}", e))?;

    let num_segments = state.full_n_segments()
        .map_err(|e| format!("Error: {}", e))?;

    let mut texto = String::new();
    for i in 0..num_segments {
        if let Ok(segmento) = state.full_get_segment_text(i) {
            texto.push_str(&segmento);
            texto.push(' ');
        }
    }

    Ok(texto.trim().to_string())
}
```

### Opción B: faster-whisper (Python)
Ejecutar `faster-whisper` como proceso externo. Requiere que el usuario tenga Python y faster-whisper instalados.

**Ventajas:** más rápido que el Whisper original de OpenAI, soporte CTranslate2, mejor uso de GPU
**Desventaja:** requiere Python y la librería instalada

```rust
#[tauri::command]
fn transcribir_con_faster_whisper(
    ruta_audio: String,
    modelo: String
) -> Result<String, String> {
    let output = std::process::Command::new("faster-whisper")
        .args(&[&ruta_audio, "--model", &modelo, "--language", "es"])
        .output()
        .map_err(|e| format!("Error ejecutando faster-whisper: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
```

### Opción C: whisper original (OpenAI CLI)
Ejecutar el CLI de OpenAI Whisper como proceso externo.

**Ventajas:** implementación de referencia, bien documentada
**Desventaja:** más lento que faster-whisper, requiere Python

```rust
#[tauri::command]
fn transcribir_con_whisper_cli(
    ruta_audio: String,
    modelo: String
) -> Result<String, String> {
    let output = std::process::Command::new("whisper")
        .args(&[&ruta_audio, "--model", &modelo, "--language", "es", "--output_format", "txt"])
        .output()
        .map_err(|e| format!("Error ejecutando whisper: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
```

### Opción D: API externa (OpenAI Whisper API)
Enviar el audio a la API de OpenAI para transcripción en la nube.

**Ventajas:** sin requisitos de hardware, modelos potentes
**Desventaja:** requiere conexión a internet y API key, tiene costo

```rust
#[tauri::command]
async fn transcribir_con_api(ruta_audio: String, api_key: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let archivo = tokio::fs::read(&ruta_audio)
        .await
        .map_err(|e| format!("Error leyendo archivo: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .text("model", "whisper-1")
        .text("language", "es")
        .part("file", reqwest::multipart::Part::bytes(archivo)
            .file_name("audio.wav"));

    let res = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .bearer_auth(&api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Error en API: {}", e))?;

    let body: serde_json::Value = res.json().await
        .map_err(|e| format!("Error parseando respuesta: {}", e))?;

    Ok(body["text"].as_str().unwrap_or("").to_string())
}
```

---

## 2. Modelos disponibles por backend

| Modelo | Parámetros | RAM aprox. | Velocidad | Calidad |
|--------|-----------|------------|-----------|---------|
| tiny | 39M | ~1 GB | Muy rápida | Básica |
| base | 74M | ~1 GB | Rápida | Aceptable |
| small | 244M | ~2 GB | Media | Buena |
| medium | 769M | ~5 GB | Lenta | Muy buena |
| large-v3 | 1550M | ~10 GB | Muy lenta | Excelente |

> **Recomendación:** para uso en tiempo real con el monigote, `tiny` o `base` ofrecen el mejor balance entre velocidad y calidad. Para transcripciones donde la precisión es crítica, `small` o `medium`.

---

## 3. Captura de audio (micrófono)

Para capturar audio del micrófono en Rust se usa el crate `cpal`:

```toml
# Cargo.toml
[dependencies]
cpal = "0.15"
hound = "3.5"  # para guardar WAV
```

```rust
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

#[tauri::command]
fn grabar_audio(duracion_secs: u64, ruta_salida: String) -> Result<String, String> {
    let host = cpal::default_host();
    let device = host.default_input_device()
        .ok_or("No se encontró micrófono")?;

    let config = device.default_input_config()
        .map_err(|e| format!("Error en config de audio: {}", e))?;

    // Grabar audio PCM y guardar como WAV en ruta_salida
    // ... configurar stream, buffer, y writer con hound

    Ok(ruta_salida)
}
```

### Flujo de captura
```
Usuario presiona botón "Hablar" (o hotkey)
  → Frontend envía invoke("grabar_audio", { duracion: 5 })
    → Rust captura audio del micrófono con cpal
      → Guarda archivo WAV temporal
        → Pasa el archivo al modelo de transcripción elegido
          → Retorna texto transcrito al frontend
```

---

## 4. Selector de modelo (frontend)

El usuario puede elegir backend y modelo desde un menú de configuración:

```js
// Configuración guardada en localStorage o archivo de config
const configAudio = {
  backend: "whisper-cpp",  // "whisper-cpp" | "faster-whisper" | "whisper-cli" | "api"
  modelo: "base",          // "tiny" | "base" | "small" | "medium" | "large-v3"
  idioma: "es",
  rutaModelo: null,        // ruta personalizada al archivo del modelo (solo whisper.cpp)
  apiKey: null              // solo para backend "api"
};

async function transcribir(rutaAudio) {
  switch (configAudio.backend) {
    case "whisper-cpp":
      return await window.__TAURI__.core.invoke("transcribir_audio", {
        rutaAudio,
        modelo: configAudio.rutaModelo || configAudio.modelo
      });
    case "faster-whisper":
      return await window.__TAURI__.core.invoke("transcribir_con_faster_whisper", {
        rutaAudio,
        modelo: configAudio.modelo
      });
    case "whisper-cli":
      return await window.__TAURI__.core.invoke("transcribir_con_whisper_cli", {
        rutaAudio,
        modelo: configAudio.modelo
      });
    case "api":
      return await window.__TAURI__.core.invoke("transcribir_con_api", {
        rutaAudio,
        apiKey: configAudio.apiKey
      });
  }
}
```

---

## 5. Flujo completo con el monigote

1. Usuario hace click en el monigote o presiona hotkey
2. Monigote muestra burbuja: "🎙️ Te escucho..." con animación de grabación
3. Captura audio del micrófono durante N segundos (o hasta silencio)
4. Monigote muestra burbuja: "Procesando..."
5. Audio se envía al backend de transcripción seleccionado
6. Texto transcrito se recibe en el frontend
7. Monigote muestra burbuja con el texto reconocido y opciones de acción
8. Usuario confirma o corrige

```
  ┌──────────────────┐
  │ "Abrir terminal" │
  │                  │
  │ [Ejecutar] [No]  │
  └──────────────────┘
         🐾
```

---

## 6. Dependencias técnicas

### Crates de Rust
| Crate | Versión | Propósito |
|-------|---------|-----------|
| `whisper-rs` | 0.12 | Bindings de whisper.cpp |
| `cpal` | 0.15 | Captura de audio del micrófono |
| `hound` | 3.5 | Lectura/escritura de archivos WAV |
| `reqwest` | 0.12 | Llamadas HTTP (solo para API externa) |
| `tokio` | 1.0 | Async runtime (solo para API externa) |

### Archivos de modelo
Los modelos de whisper.cpp se descargan como archivos `.bin` y se almacenan localmente:
- Ruta sugerida: `~/.local/share/deskcritter/models/`
- Descarga automática en primer uso o manual por el usuario

### Permisos Tauri necesarios
- Acceso al micrófono del sistema
- Lectura/escritura de archivos temporales
- Acceso a red (solo para backend API)

---

## Relación con el roadmap

- **Fase 6 — IA conversacional**: la transcripción de voz es el input principal para conversar con el monigote
- **Fase 5 — Integración con sistema**: permite dar comandos de voz para acciones del sistema
- **Fase 4 — Interacción avanzada**: control por voz de mini-juegos y funciones
