import { SpriteAnimator } from './sprite.js';
import { StateMachine } from './state-machine.js';

const canvas = document.getElementById('critter');
const ctx = canvas.getContext('2d');

// --- Sprite Animator ---
const sprite = new SpriteAnimator(ctx, 32, 32, 6);

// Animaciones: nombre, fila en el sheet, frames, duración por frame (ms)
sprite.addAnimation('idle', 0, 4, 300);
sprite.addAnimation('blink', 1, 3, 150);
sprite.addAnimation('look_left', 2, 2, 250);
sprite.addAnimation('look_right', 3, 2, 250);
sprite.addAnimation('drag', 4, 2, 200);

// --- Máquina de estados ---
const fsm = new StateMachine();

fsm.addState('idle', {
  animation: 'idle',
  minDuration: 2000,
  maxDuration: 5000,
  transitions: [
    { to: 'blink', weight: 4 },
    { to: 'look_left', weight: 2 },
    { to: 'look_right', weight: 2 }
  ]
});

fsm.addState('blink', {
  animation: 'blink',
  minDuration: 400,
  maxDuration: 600,
  transitions: [
    { to: 'idle', weight: 10 }
  ]
});

fsm.addState('look_left', {
  animation: 'look_left',
  minDuration: 1000,
  maxDuration: 2500,
  transitions: [
    { to: 'idle', weight: 6 },
    { to: 'blink', weight: 3 },
    { to: 'look_right', weight: 1 }
  ]
});

fsm.addState('look_right', {
  animation: 'look_right',
  minDuration: 1000,
  maxDuration: 2500,
  transitions: [
    { to: 'idle', weight: 6 },
    { to: 'blink', weight: 3 },
    { to: 'look_left', weight: 1 }
  ]
});

fsm.addState('drag', {
  animation: 'drag',
  minDuration: 999999,
  maxDuration: 999999,
  transitions: []
});

fsm.start('idle');
sprite.play('idle');

// --- Drag & Drop ---
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

canvas.addEventListener('mousedown', async (e) => {
  isDragging = true;
  dragOffsetX = e.screenX;
  dragOffsetY = e.screenY;
  fsm.forceState('drag');
  sprite.play('drag');
});

document.addEventListener('mousemove', async (e) => {
  if (!isDragging) return;

  const deltaX = e.screenX - dragOffsetX;
  const deltaY = e.screenY - dragOffsetY;
  dragOffsetX = e.screenX;
  dragOffsetY = e.screenY;

  // Mover la ventana Tauri
  try {
    const win = window.__TAURI__.window.getCurrentWindow();
    const pos = await win.outerPosition();
    await win.setPosition(new window.__TAURI__.window.PhysicalPosition(pos.x + deltaX, pos.y + deltaY));
  } catch {
    // Fallback si no estamos en Tauri (desarrollo en navegador)
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    fsm.forceState('idle');
    sprite.play('idle');
  }
});

// --- Seguimiento del cursor ---
document.addEventListener('mousemove', (e) => {
  if (isDragging) return;

  const centerX = canvas.width / 2;
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;

  // Si el mouse está a la izquierda o derecha del monigote, mirar en esa dirección
  const threshold = 40;
  if (mouseX < centerX - threshold && fsm.current !== 'look_left' && fsm.current !== 'blink') {
    fsm.forceState('look_left');
    sprite.play('look_left');
  } else if (mouseX > centerX + threshold && fsm.current !== 'look_right' && fsm.current !== 'blink') {
    fsm.forceState('look_right');
    sprite.play('look_right');
  }
});

// --- Game Loop ---
let lastTime = 0;

async function init() {
  try {
    await sprite.loadSheet('assets/critter.png');
  } catch {
    // Si no hay sprite sheet, dibujamos un placeholder
    drawPlaceholder();
    return;
  }
  requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
  const deltaTime = lastTime ? timestamp - lastTime : 16;
  lastTime = timestamp;

  // Actualizar estado
  const newState = fsm.update(deltaTime);
  if (newState) {
    const stateConfig = fsm.states[newState];
    if (stateConfig) sprite.play(stateConfig.animation);
  }

  // Actualizar y dibujar sprite
  sprite.update(deltaTime);
  sprite.draw();

  requestAnimationFrame(gameLoop);
}

// Placeholder mientras no hay sprite sheet real
function drawPlaceholder() {
  const size = 192;
  const x = (canvas.width - size) / 2;
  const y = (canvas.height - size) / 2;

  function draw(timestamp) {
    const deltaTime = lastTime ? timestamp - lastTime : 16;
    lastTime = timestamp;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Cuerpo
    ctx.fillStyle = '#5b8c5a';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2 + 10, size / 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Ojos
    const breathe = Math.sin(timestamp / 800) * 3;
    const eyeY = canvas.height / 2 + breathe;

    // Parpadeo
    const blinkCycle = timestamp % 4000;
    const isBlinking = blinkCycle > 3800;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(canvas.width / 2 - 20, eyeY - 5, isBlinking ? 2 : 12, 0, Math.PI * 2);
    ctx.arc(canvas.width / 2 + 20, eyeY - 5, isBlinking ? 2 : 12, 0, Math.PI * 2);
    ctx.fill();

    // Pupilas
    if (!isBlinking) {
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.arc(canvas.width / 2 - 18, eyeY - 3, 6, 0, Math.PI * 2);
      ctx.arc(canvas.width / 2 + 22, eyeY - 3, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sonrisa
    ctx.strokeStyle = '#2d4a2d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, eyeY + 18, 12, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

init();
