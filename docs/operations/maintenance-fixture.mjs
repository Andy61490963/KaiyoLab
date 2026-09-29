// 僅由 CI 的隔離容器使用，不讀取應用程式設定或連接資料庫
import { createServer } from 'node:http';

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://app:4321');
  const status = Number(url.pathname.slice(1)) || 200;
  response.writeHead(status, { 'Content-Type': 'application/json', 'X-Fixture': 'upstream' });
  response.end(
    JSON.stringify({
      status,
      host: request.headers.host,
      forwardedHost: request.headers['x-forwarded-host'],
      forwardedProto: request.headers['x-forwarded-proto'],
    }),
  );
});
server.listen(4321, '0.0.0.0');
process.once('SIGTERM', () => server.close(() => process.exit(0)));
