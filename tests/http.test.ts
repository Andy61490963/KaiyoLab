import { describe, expect, it } from 'vitest';
import { body } from '../src/lib/http';

describe('請求大小限制', () => {
  it('可讀取串流 JSON', async () => {
    const request = new Request('http://localhost/api', {
      method: 'POST',
      body: JSON.stringify({ title: '創作' }),
    });
    expect(await body(request)).toEqual({ title: '創作' });
  });

  it('沒有 Content-Length 也會中止超過上限的內容', async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(600_000));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('http://localhost/api', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    await expect(body(request)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
  });

  it('拒絕空請求與不合法 JSON', async () => {
    await expect(
      body(new Request('http://localhost/api', { method: 'POST' })),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      body(new Request('http://localhost/api', { method: 'POST', body: '{' })),
    ).rejects.toMatchObject({ status: 400 });
  });
});
