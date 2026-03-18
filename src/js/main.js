import { SpriteAnimator } from './sprite.js';
import { StateMachine } from './state-machine.js';
import { Physics } from './physics.js';

const canvas = document.getElementById('critter');
const ctx = canvas.getContext('2d');

// --- Sprite Animator (32x32, escalado x3 = 96px) ---
const sprite = new SpriteAnimator(ctx, 32, 32, 3);

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
    { to: 'look_right', weight: 2 },
    { to: 'walk_left', weight: 1 },
    { to: 'walk_right', weight: 1 }
  ]
});

fsm.addState('blink', {
  animation: 'blink',
  minDuration: 400,
  maxDuration: 600,
  transitions: [{ to: 'idle', weight: 10 }]
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

fsm.addState('walk_left', {
  animation: 'look_left',
  minDuration: 2000,
  maxDuration: 5000,
  transitions: [
    { to: 'idle', weight: 5 },
    { to: 'walk_right', weight: 1 }
  ]
});

fsm.addState('walk_right', {
  animation: 'look_right',
  minDuration: 2000,
  maxDuration: 5000,
  transitions: [
    { to: 'idle', weight: 5 },
    { to: 'walk_left', weight: 1 }
  ]
});

fsm.addState('fall', {
  animation: 'drag',
  minDuration: 999999,
  maxDuration: 999999,
  transitions: []
});

fsm.addState('drag', {
  animation: 'drag',
  minDuration: 999999,
  maxDuration: 999999,
  transitions: []
});

fsm.start('idle');
sprite.play('idle');

// --- Físicas ---
const physics = new Physics(96);

// --- Drag & Drop (usa posición real de Tauri, no tracking interno) ---
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  dragOffsetX = e.screenX;
  dragOffsetY = e.screenY;
  fsm.forceState('drag');
  sprite.play('drag');
  physics.stopWalk();
});

document.addEventListener('mousemove', async (e) => {
  if (!isDragging) return;

  const deltaX = e.screenX - dragOffsetX;
  const deltaY = e.screenY - dragOffsetY;
  dragOffsetX = e.screenX;
  dragOffsetY = e.screenY;

  // Mover ventana usando posición real (evita drift de coordenadas)
  try {
    const win = window.__TAURI__.window.getCurrentWindow();
    const pos = await win.outerPosition();
    await win.setPosition(new window.__TAURI__.window.PhysicalPosition(
      pos.x + deltaX, pos.y + deltaY
    ));
  } catch {}
});

document.addEventListener('mouseup', async () => {
  if (!isDragging) return;
  isDragging = false;

  // Sincronizar físicas con la posición real de la ventana
  try {
    const win = window.__TAURI__.window.getCurrentWindow();
    const pos = await win.outerPosition();
    physics.x = pos.x;
    physics.y = pos.y;
  } catch {}

  // Si está en el aire, caer; si está en el suelo, volver a idle
  physics.release();
  if (physics.y < physics.groundY) {
    fsm.forceState('fall');
    sprite.play('drag');
  } else {
    physics.y = physics.groundY;
    physics.grounded = true;
    fsm.forceState('idle');
    sprite.play('idle');
  }
});

// --- Seguimiento del cursor ---
document.addEventListener('mousemove', (e) => {
  if (isDragging) return;

  const passive = ['idle', 'blink', 'look_left', 'look_right'];
  if (!passive.includes(fsm.current)) return;

  const centerX = canvas.width / 2;
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;

  const threshold = 20;
  if (mouseX < centerX - threshold && fsm.current !== 'look_left' && fsm.current !== 'blink') {
    fsm.forceState('look_left');
    sprite.play('look_left');
  } else if (mouseX > centerX + threshold && fsm.current !== 'look_right' && fsm.current !== 'blink') {
    fsm.forceState('look_right');
    sprite.play('look_right');
  }
});

// --- Mover ventana Tauri ---
function moveWindow(x, y) {
  try {
    const win = window.__TAURI__.window.getCurrentWindow();
    win.setPosition(new window.__TAURI__.window.PhysicalPosition(
      Math.round(x), Math.round(y)
    ));
  } catch {}
}

// --- Manejo de cambio de estado ---
function handleStateChange(newState) {
  const config = fsm.states[newState];
  if (config) sprite.play(config.animation);

  if (newState === 'walk_left') {
    if (physics.grounded) {
      physics.startWalk(-1);
    } else {
      fsm.forceState('idle');
      sprite.play('idle');
      return;
    }
  } else if (newState === 'walk_right') {
    if (physics.grounded) {
      physics.startWalk(1);
    } else {
      fsm.forceState('idle');
      sprite.play('idle');
      return;
    }
  } else {
    physics.stopWalk();
  }
}

// --- Game Loop ---
let lastTime = 0;
let lastPosX = -1;
let lastPosY = -1;

async function init() {
  try {
    await sprite.loadSheet('assets/critter.png');
  } catch {
    drawPlaceholder();
    return;
  }

  // Ajustar ventana al tamaño real del sprite
  try {
    const win = window.__TAURI__.window.getCurrentWindow();
    await win.setSize(new window.__TAURI__.window.LogicalSize(96, 96));
  } catch (e) {
    console.error('Error al redimensionar ventana:', e);
  }

  await physics.initScreenBounds();

  // Gravedad inicial: el monigote cae desde su posición de inicio
  if (physics.y < physics.groundY) {
    physics.grounded = false;
    fsm.forceState('fall');
    sprite.play('drag');
  } else {
    physics.grounded = true;
  }

  requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
  const deltaTime = lastTime ? timestamp - lastTime : 16;
  lastTime = timestamp;

  // Actualizar estado
  const newState = fsm.update(deltaTime);
  if (newState) {
    handleStateChange(newState);
  }

  // Actualizar física (solo si no está en drag)
  if (!isDragging) {
    const pos = physics.update(deltaTime);

    // Si aterrizó mientras caía
    if (pos.grounded && fsm.current === 'fall') {
      fsm.forceState('idle');
      sprite.play('idle');
    }

    // Si llegó a un borde caminando, detenerse
    if (pos.hitEdge && (fsm.current === 'walk_left' || fsm.current === 'walk_right')) {
      fsm.forceState('idle');
      sprite.play('idle');
    }

    // Mover ventana si la posición cambió
    if (pos.x !== lastPosX || pos.y !== lastPosY) {
      lastPosX = pos.x;
      lastPosY = pos.y;
      moveWindow(pos.x, pos.y);
    }
  }

  // Actualizar y dibujar sprite
  sprite.update(deltaTime);
  sprite.draw();

  requestAnimationFrame(gameLoop);
}

// Placeholder mientras no hay sprite sheet real
function drawPlaceholder() {
  const size = 96;
  function draw(timestamp) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#5b8c5a';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2 + 5, size / 2.5, 0, Math.PI * 2);
    ctx.fill();

    const breathe = Math.sin(timestamp / 800) * 2;
    const eyeY = canvas.height / 2 + breathe;
    const blinkCycle = timestamp % 4000;
    const isBlinking = blinkCycle > 3800;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(canvas.width / 2 - 10, eyeY - 3, isBlinking ? 1 : 6, 0, Math.PI * 2);
    ctx.arc(canvas.width / 2 + 10, eyeY - 3, isBlinking ? 1 : 6, 0, Math.PI * 2);
    ctx.fill();

    if (!isBlinking) {
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.arc(canvas.width / 2 - 9, eyeY - 2, 3, 0, Math.PI * 2);
      ctx.arc(canvas.width / 2 + 11, eyeY - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#2d4a2d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, eyeY + 9, 6, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

init();
