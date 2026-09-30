import {
  createRiskSimulation,
  type RiskWorkerRequest,
  type RiskWorkerResponse,
} from '../lib/lab/risk';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RiskWorkerRequest>) => void) | null;
  postMessage: (message: RiskWorkerResponse) => void;
};
let active = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'cancel') {
    if (message.id === active) {
      active = 0;
      clearTimeout(timer);
    }
    return;
  }
  active = message.id;
  clearTimeout(timer);
  const id = message.id;
  const start = performance.now();
  let lastProgress = start;
  try {
    const simulation = createRiskSimulation(message.input);
    const advance = () => {
      if (active !== id) return;
      try {
        const completed = simulation.batch(96);
        if (completed === message.input.paths) {
          const result = simulation.finish();
          if (active === id)
            scope.postMessage({ type: 'result', id, result, elapsed: performance.now() - start });
          active = 0;
        } else {
          if (performance.now() - lastProgress >= 60) {
            scope.postMessage({ type: 'progress', id, completed, total: message.input.paths });
            lastProgress = performance.now();
          }
          // 批次間讓出 Worker 事件迴圈，取消訊息不必等全部路徑完成
          timer = setTimeout(advance, 0);
        }
      } catch (error) {
        if (active === id)
          scope.postMessage({
            type: 'error',
            id,
            error: error instanceof Error ? error.message : 'UNKNOWN',
          });
        active = 0;
      }
    };
    timer = setTimeout(advance, 0);
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : 'UNKNOWN',
    });
    active = 0;
  }
};
