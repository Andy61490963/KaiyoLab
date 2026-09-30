export const FLOW_STEP = 1 / 120;
export const FLOW_MAX_STEPS = 12;

export interface FlowWave {
  x: number;
  y: number;
  phase: number;
  speed: number;
  amplitude: number;
}

export interface FlowProbe {
  x: number;
  y: number;
  active: boolean;
  polarity: 1 | -1;
  strength: number;
}

export interface FlowState {
  count: number;
  width: number;
  height: number;
  time: number;
  steps: number;
  seed: number;
  randomState: number;
  waves: FlowWave[];
  x: Float32Array;
  y: Float32Array;
  previousX: Float32Array;
  previousY: Float32Array;
  velocityX: Float32Array;
  velocityY: Float32Array;
  age: Float32Array;
  lifetime: Float32Array;
}

function random(state: { randomState: number }): number {
  let value = (state.randomState = (state.randomState + 0x6d2b79f5) >>> 0);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function createFlow(seed: number, count: number, aspect: number): FlowState {
  const state: FlowState = {
    count,
    width: Math.max(0.5, aspect) * 3,
    height: 3,
    time: 0,
    steps: 0,
    seed: seed >>> 0,
    randomState: seed >>> 0,
    waves: [],
    x: new Float32Array(count),
    y: new Float32Array(count),
    previousX: new Float32Array(count),
    previousY: new Float32Array(count),
    velocityX: new Float32Array(count),
    velocityY: new Float32Array(count),
    age: new Float32Array(count),
    lifetime: new Float32Array(count),
  };
  for (let octave = 0; octave < 6; octave++) {
    const angle = random(state) * Math.PI * 2;
    const frequency = 1.5 * Math.pow(1.46, octave);
    state.waves.push({
      x: Math.cos(angle) * frequency,
      y: Math.sin(angle) * frequency,
      phase: random(state) * Math.PI * 2,
      speed: (random(state) - 0.5) * 0.24,
      amplitude: 0.62 / Math.pow(frequency, 1.5),
    });
  }
  for (let index = 0; index < count; index++) respawn(state, index);
  return state;
}

function respawn(state: FlowState, index: number): void {
  state.x[index] = state.previousX[index] = random(state) * state.width;
  state.y[index] = state.previousY[index] = random(state) * state.height;
  state.velocityX[index] = state.velocityY[index] = 0;
  state.age[index] = 0;
  state.lifetime[index] = 12 + random(state) * 16;
}

// 速度取流函數的旋度 (∂ψ/∂y, −∂ψ/∂x)，交叉偏導相消得到零散度
export function sampleCurl(
  waves: FlowWave[],
  x: number,
  y: number,
  time: number,
): [number, number] {
  let velocityX = 0;
  let velocityY = 0;
  for (const wave of waves) {
    const derivative =
      wave.amplitude * Math.cos(wave.x * x + wave.y * y + wave.phase + time * wave.speed);
    velocityX += wave.y * derivative;
    velocityY -= wave.x * derivative;
  }
  return [velocityX, velocityY];
}

export function stepFlow(state: FlowState, probe: FlowProbe, speed: number = 1): void {
  const dt = FLOW_STEP;
  const relax = 1 - Math.exp(-5 * dt);
  const phaseTime = state.time;
  for (let index = 0; index < state.count; index++) {
    const x = state.x[index];
    const y = state.y[index];
    state.previousX[index] = x;
    state.previousY[index] = y;
    let desiredX = 0;
    let desiredY = 0;
    // 熱路徑直接累積，避免每粒子每步配置向量陣列
    for (const wave of state.waves) {
      const derivative =
        wave.amplitude * Math.cos(wave.x * x + wave.y * y + wave.phase + phaseTime * wave.speed);
      desiredX += wave.y * derivative;
      desiredY -= wave.x * derivative;
    }
    if (probe.active) {
      const dx = probe.x - x;
      const dy = probe.y - y;
      const radiusSquared = dx * dx + dy * dy;
      const force =
        (probe.polarity * probe.strength * Math.exp(-radiusSquared / 0.7)) /
        Math.sqrt(radiusSquared + 0.035);
      desiredX += dx * force;
      desiredY += dy * force;
    }
    state.velocityX[index] += (desiredX * speed - state.velocityX[index]) * relax;
    state.velocityY[index] += (desiredY * speed - state.velocityY[index]) * relax;
    state.x[index] += state.velocityX[index] * dt;
    state.y[index] += state.velocityY[index] * dt;
    state.age[index] += dt;
    if (state.age[index] > state.lifetime[index]) {
      respawn(state, index);
    } else if (
      state.x[index] < 0 ||
      state.x[index] >= state.width ||
      state.y[index] < 0 ||
      state.y[index] >= state.height
    ) {
      state.x[index] = (state.x[index] + state.width) % state.width;
      state.y[index] = (state.y[index] + state.height) % state.height;
      state.previousX[index] = state.x[index];
      state.previousY[index] = state.y[index];
    }
  }
  state.steps++;
  state.time = state.steps * dt;
}

export function advanceFlow(
  state: FlowState,
  probe: FlowProbe,
  accumulator: number,
  elapsed: number,
  speed = 1,
): number {
  let remaining = accumulator + Math.max(0, Math.min(elapsed, FLOW_STEP * FLOW_MAX_STEPS));
  let steps = 0;
  while (remaining + 1e-10 >= FLOW_STEP && steps < FLOW_MAX_STEPS) {
    stepFlow(state, probe, speed);
    remaining -= FLOW_STEP;
    steps++;
  }
  return Math.max(0, remaining);
}
