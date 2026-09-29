import { parentPort, workerData } from 'node:worker_threads';
import { JSDOM } from 'jsdom';

// 最小 DOM 僅供 Mermaid.parse 的文字清理器使用，不載入資源、不執行腳本、不產生 SVG
const dom = new JSDOM('');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    maxEdges: 120,
    maxTextSize: 12000,
    logLevel: 'fatal',
  });
  mermaid.parseError = () => {};
  const results = [];
  for (const source of workerData.sources) {
    try {
      await mermaid.parse(source);
      results.push(null);
    } catch (error) {
      results.push(error instanceof Error ? error.message.slice(0, 240) : '無法解析圖表語法');
    }
  }
  parentPort.postMessage({ results });
} catch {
  parentPort.postMessage({ unavailable: true });
} finally {
  dom.window.close();
}
