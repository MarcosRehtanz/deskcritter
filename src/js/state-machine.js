// Máquina de estados finita para comportamientos del monigote
export class StateMachine {
  constructor() {
    this.states = {};
    this.current = null;
    this.timer = 0;
  }

  // Registra un estado con su configuración
  // config: { animation, minDuration, maxDuration, transitions: [{ to, weight }] }
  addState(name, config) {
    this.states[name] = config;
  }

  // Inicia la máquina en un estado
  start(stateName) {
    this.current = stateName;
    this.timer = this._randomDuration(stateName);
  }

  // Fuerza un cambio de estado (para input del usuario)
  forceState(stateName) {
    if (!this.states[stateName]) return;
    this.current = stateName;
    this.timer = this._randomDuration(stateName);
  }

  // Actualiza y decide si transicionar
  update(deltaTime) {
    if (!this.current) return null;

    this.timer -= deltaTime;
    if (this.timer <= 0) {
      const next = this._pickTransition();
      if (next) {
        this.current = next;
        this.timer = this._randomDuration(next);
        return next; // Notifica el cambio
      }
    }
    return null;
  }

  // Elige la próxima transición basada en pesos
  _pickTransition() {
    const state = this.states[this.current];
    if (!state || !state.transitions || state.transitions.length === 0) return null;

    const totalWeight = state.transitions.reduce((sum, t) => sum + t.weight, 0);
    let random = Math.random() * totalWeight;

    for (const t of state.transitions) {
      random -= t.weight;
      if (random <= 0) return t.to;
    }
    return state.transitions[0].to;
  }

  // Genera una duración aleatoria dentro del rango del estado
  _randomDuration(stateName) {
    const state = this.states[stateName];
    if (!state) return 1000;
    const min = state.minDuration || 1000;
    const max = state.maxDuration || 3000;
    return min + Math.random() * (max - min);
  }
}
