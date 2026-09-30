import { describe, expect, it } from 'vitest';
import {
  advanceKinetic,
  cyclicDistance,
  kineticSettled,
  momentumTarget,
  nearestLoopTarget,
  wrapIndex,
} from '../src/lib/lab/kinetic-motion';
import {
  advanceFlow,
  createFlow,
  FLOW_MAX_STEPS,
  FLOW_STEP,
  sampleCurl,
  stepFlow,
  type FlowProbe,
} from '../src/lib/lab/flow-engine';

const noProbe: FlowProbe = { x: 1.5, y: 1.5, active: false, polarity: 1, strength: 1.8 };

describe('連續輪播座標與物理模型', () => {
  it('負方向與多次循環保持同一組圖像索引', () => {
    expect(wrapIndex(-1, 6)).toBe(5);
    expect(wrapIndex(600001, 6)).toBe(1);
    expect(cyclicDistance(0, 5.95, 6)).toBeCloseTo(0.05);
    expect(cyclicDistance(0, 6.05, 6)).toBeCloseTo(-0.05);
    expect(cyclicDistance(0, 600000.05, 6)).toBeCloseTo(-0.05);
  });
  it('第一張與最後一張使用最近的連續座標', () => {
    expect(nearestLoopTarget(0, 5, 6)).toBe(6);
    expect(nearestLoopTarget(5, 0, 6)).toBe(-1);
    expect(nearestLoopTarget(0, -7, 6)).toBe(-6);
  });
  it('快速拖曳會依速度多前進，極端輸入有界', () => {
    expect(momentumTarget(0.6, 0)).toBe(1);
    expect(momentumTarget(0.6, 8)).toBe(2);
    expect(momentumTarget(0.6, -8)).toBe(-1);
    expect(momentumTarget(0, 100000)).toBe(3);
  });
  it('彈簧解析解不因 30 Hz 與 120 Hz 更新率改變', () => {
    const slow = { position: -0.6, target: 3, velocity: 8 };
    const fast = { ...slow };
    for (let index = 0; index < 15; index++) advanceKinetic(slow, 1 / 30);
    for (let index = 0; index < 60; index++) advanceKinetic(fast, 1 / 120);
    expect(slow.position).toBeCloseTo(fast.position, 10);
    expect(slow.velocity).toBeCloseTo(fast.velocity, 10);
  });
  it('快速改變目標仍能收斂，長時間離頁不放大步進', () => {
    const state = { position: 3, target: -12, velocity: -9 };
    advanceKinetic(state, 1000);
    expect(Number.isFinite(state.position)).toBe(true);
    state.target = 6;
    for (let index = 0; index < 600; index++) advanceKinetic(state, 1 / 60);
    expect(state).toEqual({ position: 6, target: 6, velocity: 0 });
    expect(kineticSettled(state)).toBe(true);
  });
});

describe('旋度流場與固定時間步進', () => {
  it('種子重現相同場與粒子，換種子才改變圖樣', () => {
    const first = createFlow(731, 100, 1.5);
    const same = createFlow(731, 100, 1.5);
    const different = createFlow(732, 100, 1.5);
    expect(first.x).toEqual(same.x);
    expect(first.waves).toEqual(same.waves);
    expect(first.x).not.toEqual(different.x);
    expect(first.waves).not.toEqual(different.waves);
  });
  it('解析旋度的數值散度接近零', () => {
    const state = createFlow(731, 10, 1.5);
    const epsilon = 0.0001;
    for (let index = 0; index < 10; index++) {
      const x = index * 0.3;
      const y = index * 0.2;
      const right = sampleCurl(state.waves, x + epsilon, y, 2);
      const left = sampleCurl(state.waves, x - epsilon, y, 2);
      const below = sampleCurl(state.waves, x, y + epsilon, 2);
      const above = sampleCurl(state.waves, x, y - epsilon, 2);
      const divergence = (right[0] - left[0] + below[1] - above[1]) / (2 * epsilon);
      expect(Math.abs(divergence)).toBeLessThan(0.00001);
    }
  });
  it('相同時間的 30、60、144 Hz 渲染得到完全相同模擬結果', () => {
    const states = [30, 60, 144].map((rate) => {
      const state = createFlow(731, 120, 1.5);
      let accumulator = 0;
      for (let index = 0; index < rate * 2; index++)
        accumulator = advanceFlow(state, noProbe, accumulator, 1 / rate);
      return state;
    });
    expect(states.map((state) => state.steps)).toEqual([240, 240, 240]);
    expect(states[0].x).toEqual(states[1].x);
    expect(states[0].x).toEqual(states[2].x);
    expect(states[0].velocityY).toEqual(states[2].velocityY);
  });
  it('長幀最多前進 12 步，沒有無上限追趕造成卡死', () => {
    const state = createFlow(9, 30, 1);
    const remainder = advanceFlow(state, noProbe, 0, 1000);
    expect(state.steps).toBe(FLOW_MAX_STEPS);
    expect(state.time).toBeCloseTo(0.1);
    expect(remainder).toBeLessThan(FLOW_STEP);
  });
  it('吸引與排斥相對於原場產生方向相反的加速度', () => {
    const baseline = createFlow(71, 1, 1);
    const attracted = createFlow(71, 1, 1);
    const repelled = createFlow(71, 1, 1);
    const probe: FlowProbe = {
      x: baseline.x[0] + 0.2,
      y: baseline.y[0],
      active: true,
      polarity: 1,
      strength: 1.8,
    };
    stepFlow(baseline, noProbe);
    stepFlow(attracted, probe);
    stepFlow(repelled, { ...probe, polarity: -1 });
    expect(attracted.velocityX[0]).toBeGreaterThan(baseline.velocityX[0]);
    expect(repelled.velocityX[0]).toBeLessThan(baseline.velocityX[0]);
  });
  it('作用點與粒子重合時沒有除零，長時間座標維持有限且在場內', () => {
    const state = createFlow(3, 20, 1);
    const probe: FlowProbe = {
      ...noProbe,
      active: true,
      x: state.x[0],
      y: state.y[0],
      polarity: -1,
    };
    for (let index = 0; index < 4000; index++) stepFlow(state, probe, 2);
    for (let index = 0; index < state.count; index++) {
      expect(Number.isFinite(state.x[index] + state.y[index] + state.velocityX[index])).toBe(true);
      expect(state.x[index]).toBeGreaterThanOrEqual(0);
      expect(state.x[index]).toBeLessThan(state.width);
      expect(state.y[index]).toBeGreaterThanOrEqual(0);
      expect(state.y[index]).toBeLessThan(state.height);
    }
  });
  it('重設後相同操作仍重現軌跡', () => {
    const original = createFlow(68, 40, 1.5);
    const replay = createFlow(68, 40, 1.5);
    const activeProbe = { ...noProbe, active: true };
    for (const state of [original, replay])
      for (let index = 0; index < 180; index++) stepFlow(state, activeProbe, 1.4);
    expect(original.x).toEqual(replay.x);
    expect(original.y).toEqual(replay.y);
    expect(original.steps).toBe(180);
  });
});
