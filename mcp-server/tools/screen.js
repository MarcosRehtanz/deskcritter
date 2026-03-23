import { z } from 'zod';
import { execSync } from 'child_process';
import fs from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const isWin = process.platform === 'win32';

export function registerScreenTools(server) {
  server.tool(
    'screenshot',
    'Captura screenshot del PC del usuario',
    {
      x: z.number().optional().describe('X del crop'),
      y: z.number().optional().describe('Y del crop'),
      w: z.number().optional().describe('Ancho del crop'),
      h: z.number().optional().describe('Alto del crop'),
    },
    async ({ x, y, w, h }) => {
      try {
        let base64;

        if (isWin) {
          const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
${x !== undefined && y !== undefined && w !== undefined && h !== undefined
  ? `$cropped = $bmp.Clone([System.Drawing.Rectangle]::new(${x}, ${y}, ${w}, ${h}), $bmp.PixelFormat)
$bmp.Dispose()
$bmp = $cropped`
  : ''}
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
[Convert]::ToBase64String($ms.ToArray())
$bmp.Dispose()
$graphics.Dispose()
$ms.Dispose()
`.trim();

          base64 = execSync(`powershell -NoProfile -Command "${ps.replace(/\n/g, '; ').replace(/"/g, '\\"')}"`, {
            encoding: 'utf-8',
            timeout: 15000,
            maxBuffer: 50 * 1024 * 1024,
          }).trim();
        } else {
          // Linux: usar scrot para captura de pantalla
          const tmpFile = path.join(tmpdir(), `deskcritter_screenshot_${Date.now()}.png`);
          try {
            execSync(`scrot ${tmpFile}`, { timeout: 10000 });
            base64 = fs.readFileSync(tmpFile, 'base64');
          } finally {
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ image: base64, width: w || 'full', height: h || 'full' }),
          }],
        };
      } catch (err) {
        throw new Error(`Screenshot falló: ${err.message}`);
      }
    }
  );

  server.tool(
    'screen_info',
    'Obtiene información del monitor principal',
    {},
    async () => {
      let json;

      if (isWin) {
        const ps = `
Add-Type -AssemblyName System.Windows.Forms
$s = [System.Windows.Forms.Screen]::PrimaryScreen
@{ width=$s.Bounds.Width; height=$s.Bounds.Height; scale_factor=1 } | ConvertTo-Json
`.trim();

        json = execSync(`powershell -NoProfile -Command "${ps.replace(/\n/g, '; ').replace(/"/g, '\\"')}"`, {
          encoding: 'utf-8',
          timeout: 5000,
        }).trim();
      } else {
        // Linux: usar xrandr para obtener resolución
        const output = execSync('xrandr --current', { encoding: 'utf-8', timeout: 5000 });
        const match = output.match(/(\d+)x(\d+)\+/);
        if (match) {
          json = JSON.stringify({ width: parseInt(match[1]), height: parseInt(match[2]), scale_factor: 1 });
        } else {
          throw new Error('No se pudo detectar resolución con xrandr');
        }
      }

      return { content: [{ type: 'text', text: json }] };
    }
  );
}
