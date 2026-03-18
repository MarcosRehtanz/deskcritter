# Interacción: Diálogos interactivos y control de terminal

## Visión general
El monigote puede mostrar burbujas de diálogo con opciones interactivas (botones) y ejecutar comandos en la terminal del sistema. Esto combina la interfaz visual del frontend (HTML/JS) con el acceso al sistema operativo del backend (Rust/Tauri).

---

## 1. Burbujas de diálogo con botones

### Concepto
El monigote muestra globos de texto flotantes con contenido dinámico y botones de acción, similar a un asistente de escritorio.

```
┌─────────────────────────┐
│ ¿Enviar mensaje a Juan? │
│                         │
│  [Enviar]  [Cancelar]   │
└─────────────────────────┘
       🐾 (monigote)
```

### Implementación técnica

#### Frontend (HTML/CSS/JS)
- Las burbujas son elementos HTML (`<div>`) posicionados sobre el canvas del monigote
- Los botones son `<button>` estándar con event listeners
- Se posicionan relativos al sprite usando coordenadas del canvas
- Estilos CSS para apariencia pixel art coherente con el monigote

#### Estructura de un diálogo
```js
// Ejemplo de definición de diálogo
const dialogo = {
  texto: "¿Enviar mensaje a Juan?",
  opciones: [
    { label: "Enviar", accion: () => enviarMensaje("Juan") },
    { label: "Cancelar", accion: () => cerrarDialogo() }
  ]
};
```

#### Componentes necesarios
- **DialogManager** (`src/js/dialog-manager.js`): gestiona la cola de diálogos, posición y ciclo de vida
- **Plantilla HTML**: contenedor para la burbuja con área de texto y zona de botones
- **Estilos CSS**: burbuja flotante, animaciones de entrada/salida, tema pixel art

#### Tipos de diálogo
| Tipo | Descripción | Ejemplo |
|------|-------------|---------|
| Informativo | Solo texto, se cierra solo o con click | "¡Buenos días!" |
| Confirmación | Texto + Sí/No | "¿Ejecutar backup?" |
| Opciones múltiples | Texto + N botones | "¿Qué hacemos? [Email] [Terminal] [Nada]" |
| Input | Texto + campo de entrada + Aceptar | "¿A quién le envío el mensaje?" |

---

## 2. Ejecución de comandos en terminal

### Concepto
El monigote puede ejecutar comandos en la terminal del sistema operativo a través del backend de Rust, usando `std::process::Command`.

### Flujo de ejecución
```
Usuario clickea botón (JS)
  → invoke("ejecutar_comando", { cmd: "..." })
    → Rust ejecuta std::process::Command
      → Retorna stdout/stderr al frontend
        → Monigote muestra resultado en burbuja
```

### Backend (Rust/Tauri)

#### Comando Tauri
```rust
#[tauri::command]
fn ejecutar_comando(cmd: String) -> Result<String, String> {
    let output = std::process::Command::new("sh")
        .arg("-c")
        .arg(&cmd)
        .output()
        .map_err(|e| format!("Error al ejecutar: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
```

#### Registro del comando
```rust
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ejecutar_comando])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación");
}
```

### Frontend (JS)

#### Invocación desde el frontend
```js
// Usando la API global de Tauri (sin bundler)
async function ejecutarEnTerminal(comando) {
  try {
    const resultado = await window.__TAURI__.core.invoke("ejecutar_comando", {
      cmd: comando
    });
    mostrarBurbuja(resultado);
  } catch (error) {
    mostrarBurbuja(`Error: ${error}`, "error");
  }
}
```

### Seguridad

> **Importante:** ejecutar comandos arbitrarios es un riesgo de seguridad. Se deben implementar las siguientes medidas:

- **Whitelist de comandos**: solo permitir comandos predefinidos, no entrada libre del usuario
- **Validación de input**: sanitizar cualquier parámetro antes de pasarlo al shell
- **Sin sudo**: no permitir ejecución con privilegios elevados
- **Permisos Tauri**: configurar `shell:allow-execute` solo para los comandos necesarios en `capabilities/default.json`

#### Ejemplo de whitelist
```rust
const COMANDOS_PERMITIDOS: &[&str] = &[
    "date",
    "uptime",
    "whoami",
    "df -h",
];

#[tauri::command]
fn ejecutar_comando(cmd: String) -> Result<String, String> {
    if !COMANDOS_PERMITIDOS.contains(&cmd.as_str()) {
        return Err("Comando no permitido".to_string());
    }
    // ... ejecutar
}
```

---

## 3. Ejemplo de flujo completo

1. El monigote detecta que es lunes a las 9:00
2. Muestra burbuja: "¡Buenos días! ¿Qué hacemos?"
3. Botones: `[Ver clima]` `[Abrir terminal]` `[Nada, gracias]`
4. Usuario clickea `[Ver clima]`
5. JS invoca `ejecutar_comando("curl wttr.in?format=3")`
6. Rust ejecuta el comando, retorna resultado
7. Monigote muestra nueva burbuja: "☀️ Buenos Aires: +22°C"

---

## Relación con el roadmap

Estas funcionalidades se conectan con varias fases planificadas:

- **Fase 5 — Integración con sistema**: notificaciones, clima, eventos del sistema → usa ejecución de comandos
- **Fase 6 — IA conversacional**: globos de texto con diálogos → usa el sistema de burbujas interactivas
- **Fase 4 — Interacción avanzada**: mini-juegos y personalización → usa botones interactivos

---

## Dependencias técnicas
- Tauri `invoke()` ya disponible vía `window.__TAURI__`
- Permisos de shell en `src-tauri/capabilities/default.json`
- HTML/CSS para burbujas (nuevo componente)
- `std::process::Command` en Rust (librería estándar, sin dependencias externas)
