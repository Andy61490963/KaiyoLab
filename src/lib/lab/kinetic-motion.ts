export interface KineticState {
  position: number;
  velocity: number;
  target: number;
}

export const KINETIC_SPRING = { stiffness: 150, damping: 19 } as const;

export function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}

// 中心座標不在循環邊界歸零，只有繪製位置映射到週期區間
export function cyclicDistance(index: number, position: number, count: number): number {
  return wrapIndex(index - position + count / 2, count) - count / 2;
}

export function nearestLoopTarget(index: number, position: number, count: number): number {
  return position + cyclicDistance(index, position, count);
}

export function momentumTarget(position: number, velocity: number): number {
  return Math.round(position + Math.max(-12, Math.min(12, velocity)) * 0.22);
}

// 欠阻尼彈簧的解析解，不以每幀 Euler 積分累積誤差
export function advanceKinetic(state: KineticState, seconds: number): void {
  const time = Math.max(0, Math.min(seconds, 0.1));
  const decay = KINETIC_SPRING.damping / 2;
  const frequency = Math.sqrt(KINETIC_SPRING.stiffness - decay * decay);
  const displacement = state.position - state.target;
  const sine = Math.sin(frequency * time);
  const cosine = Math.cos(frequency * time);
  const envelope = Math.exp(-decay * time);
  const coefficient = (state.velocity + decay * displacement) / frequency;
  state.position = state.target + envelope * (displacement * cosine + coefficient * sine);
  state.velocity =
    envelope * (state.velocity * cosine - (decay * coefficient + displacement * frequency) * sine);
  if (Math.abs(state.position - state.target) < 0.0003 && Math.abs(state.velocity) < 0.003) {
    state.position = state.target;
    state.velocity = 0;
  }
}

export function kineticSettled(state: KineticState): boolean {
  return state.position === state.target && state.velocity === 0;
}
