// Comportamiento autónomo del monigote
// Define animaciones, estados FSM y lógica de transición
import * as config from './config.js';

// Estados pasivos (permiten seguimiento de cursor)
export const PASSIVE_STATES = ['idle', 'blink', 'look_left', 'look_right'];

// Umbral en píxeles — getter que lee de config
export function getCursorThreshold() {
  return config.get('behaviorCursorThreshold') ?? 20;
}
// Mantener la constante exportada para compatibilidad (valor inicial)
export const CURSOR_THRESHOLD = 20;

// Configura las animaciones del sprite y los estados del FSM
export function setupPet(sprite, fsm) {
  _applyAnimations(sprite);
  _applyStates(fsm);
  fsm.start('idle');
  sprite.play('idle');
}

// Re-aplica config sin reiniciar — se llama en la próxima transición de estado
export function reconfigurePet(sprite, fsm) {
  _applyAnimations(sprite);
  _applyStates(fsm);
}

function _applyAnimations(sprite) {
  const fpsIdle = config.get('behaviorFpsIdle') ?? 300;
  const fpsBlink = config.get('behaviorFpsBlink') ?? 150;
  const fpsLook = config.get('behaviorFpsLook') ?? 250;
  const fpsDrag = config.get('behaviorFpsDrag') ?? 200;

  sprite.addAnimation('idle', 0, 4, fpsIdle);
  sprite.addAnimation('blink', 1, 3, fpsBlink);
  sprite.addAnimation('look_left', 2, 2, fpsLook);
  sprite.addAnimation('look_right', 3, 2, fpsLook);
  sprite.addAnimation('drag', 4, 2, fpsDrag);

  // Animaciones emocionales (fallback a rows existentes; si el sprite tiene filas opcionales, se sobreescriben)
  const fpsFast = 100;
  const fpsSlow = 600;

  // Fallbacks (usan rows existentes)
  sprite.addAnimation('think', 1, 3, fpsBlink);     // fallback: blink
  sprite.addAnimation('happy', 0, 4, fpsFast);       // fallback: idle rápido
  sprite.addAnimation('sad', 0, 4, fpsSlow);         // fallback: idle lento
  sprite.addAnimation('celebrate', 0, 4, 80);        // fallback: idle muy rápido

  // Si el sprite tiene filas opcionales (5-9), usar las reales
  if (sprite.image) {
    const rows = Math.floor(sprite.image.naturalHeight / sprite.frameHeight);
    const cols = Math.floor(sprite.image.naturalWidth / sprite.frameWidth);
    if (rows > 5) sprite.addAnimation('sleep', 5, cols, 400);
    if (rows > 6) sprite.addAnimation('wave', 6, cols, 150);
    if (rows > 7) sprite.addAnimation('celebrate', 7, cols, 150);
    if (rows > 8) sprite.addAnimation('think', 8, cols, fpsBlink);
    if (rows > 9) sprite.addAnimation('sad', 9, cols, fpsSlow);
  }
}

function _applyStates(fsm) {
  const idleMin = config.get('behaviorIdleMin') ?? 2000;
  const idleMax = config.get('behaviorIdleMax') ?? 5000;
  const blinkMin = config.get('behaviorBlinkMin') ?? 400;
  const blinkMax = config.get('behaviorBlinkMax') ?? 600;
  const lookMin = config.get('behaviorLookMin') ?? 1000;
  const lookMax = config.get('behaviorLookMax') ?? 2500;
  const walkMin = config.get('behaviorWalkMin') ?? 2000;
  const walkMax = config.get('behaviorWalkMax') ?? 5000;

  const wBlink = config.get('behaviorWeightBlink') ?? 4;
  const wLook = config.get('behaviorWeightLook') ?? 2;
  const wWalk = config.get('behaviorWeightWalk') ?? 1;

  fsm.addState('idle', {
    animation: 'idle',
    minDuration: idleMin,
    maxDuration: idleMax,
    transitions: [
      { to: 'blink', weight: wBlink },
      { to: 'look_left', weight: wLook },
      { to: 'look_right', weight: wLook },
      { to: 'walk_left', weight: wWalk },
      { to: 'walk_right', weight: wWalk }
    ]
  });

  fsm.addState('blink', {
    animation: 'blink',
    minDuration: blinkMin,
    maxDuration: blinkMax,
    transitions: [{ to: 'idle', weight: 10 }]
  });

  fsm.addState('look_left', {
    animation: 'look_left',
    minDuration: lookMin,
    maxDuration: lookMax,
    transitions: [
      { to: 'idle', weight: 6 },
      { to: 'blink', weight: 3 },
      { to: 'look_right', weight: 1 }
    ]
  });

  fsm.addState('look_right', {
    animation: 'look_right',
    minDuration: lookMin,
    maxDuration: lookMax,
    transitions: [
      { to: 'idle', weight: 6 },
      { to: 'blink', weight: 3 },
      { to: 'look_left', weight: 1 }
    ]
  });

  fsm.addState('walk_left', {
    animation: 'look_left',
    minDuration: walkMin,
    maxDuration: walkMax,
    transitions: [
      { to: 'idle', weight: 5 },
      { to: 'walk_right', weight: 1 }
    ]
  });

  fsm.addState('walk_right', {
    animation: 'look_right',
    minDuration: walkMin,
    maxDuration: walkMax,
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

  // --- Estados emocionales (override temporales) ---
  fsm.addState('thinking', {
    animation: 'think',
    minDuration: 999999,
    maxDuration: 999999,
    transitions: []
  });

  fsm.addState('happy', {
    animation: 'happy',
    minDuration: config.get('emotionHappyMs') ?? 2000,
    maxDuration: config.get('emotionHappyMs') ?? 2000,
    transitions: [{ to: 'idle', weight: 10 }]
  });

  fsm.addState('sad', {
    animation: 'sad',
    minDuration: 999999,
    maxDuration: 999999,
    transitions: []
  });

  fsm.addState('celebrating', {
    animation: 'celebrate',
    minDuration: 2000,
    maxDuration: 2000,
    transitions: [{ to: 'idle', weight: 10 }]
  });
}

// Maneja la transición de estado: sincroniza animación y física
export function handleStateChange(newState, { fsm, sprite, physics }) {
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
