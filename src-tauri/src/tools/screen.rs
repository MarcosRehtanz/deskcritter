use serde::Serialize;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use image::ImageEncoder;
use std::io::Cursor;

#[derive(Serialize)]
pub struct ScreenshotResult {
    pub image: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize)]
pub struct ScreenInfo {
    pub width: u32,
    pub height: u32,
    pub scale_factor: f32,
}

/// Captura screenshot del monitor principal, con crop opcional
#[tauri::command]
pub fn cu_screenshot(
    x: Option<i32>,
    y: Option<i32>,
    w: Option<u32>,
    h: Option<u32>,
) -> Result<ScreenshotResult, String> {
    let monitors = xcap::Monitor::all()
        .map_err(|e| format!("Error obteniendo monitores: {}", e))?;

    let monitor = monitors.into_iter().next()
        .ok_or("No se encontró monitor")?;

    let capture = monitor.capture_image()
        .map_err(|e| format!("Error capturando pantalla: {}", e))?;

    // Crop opcional
    let img: image::DynamicImage = image::DynamicImage::from(capture);
    let cropped = if let (Some(cx), Some(cy), Some(cw), Some(ch)) = (x, y, w, h) {
        img.crop_imm(cx as u32, cy as u32, cw, ch)
    } else {
        img
    };

    let width = cropped.width();
    let height = cropped.height();

    // Codificar como PNG → base64
    let mut buf = Cursor::new(Vec::new());
    let encoder = image::codecs::png::PngEncoder::new(&mut buf);
    encoder.write_image(
        cropped.as_bytes(),
        width,
        height,
        cropped.color().into(),
    ).map_err(|e| format!("Error codificando PNG: {}", e))?;

    let base64_str = BASE64.encode(buf.into_inner());

    Ok(ScreenshotResult {
        image: base64_str,
        width,
        height,
    })
}

/// Información del monitor principal
#[tauri::command]
pub fn cu_screen_info() -> Result<ScreenInfo, String> {
    let monitors = xcap::Monitor::all()
        .map_err(|e| format!("Error obteniendo monitores: {}", e))?;

    let monitor = monitors.into_iter().next()
        .ok_or("No se encontró monitor")?;

    Ok(ScreenInfo {
        width: monitor.width(),
        height: monitor.height(),
        scale_factor: monitor.scale_factor(),
    })
}
