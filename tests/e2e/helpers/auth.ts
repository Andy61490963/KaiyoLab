import { expect, type APIRequestContext } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';

// 遵守正式登入限流，重複驗收共用這個有界重試入口，不關閉安全檢查
export async function signInForFixture(request: APIRequestContext, origin: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await request.post('/api/auth/sign-in/email', {
      headers: { Origin: origin },
      data: {
        email: process.env.E2E_EMAIL || 'e2e@example.test',
        password: process.env.E2E_PASSWORD || 'KaiyoLab-e2e-password-2026',
      },
    });
    if (response.status() !== 429 || attempt === 2) {
      expect(
        response.ok(),
        `Fixture sign-in returned ${response.status()}: ${await response.text()}`,
      ).toBe(true);
      return;
    }
    const seconds = Number(
      response.headers()['retry-after'] || response.headers()['x-retry-after'] || '60',
    );
    expect(
      Number.isFinite(seconds) && seconds >= 0 && seconds <= 60,
      'Bounded server retry delay',
    ).toBe(true);
    await response.dispose();
    await delay((seconds + 1) * 1000);
  }
}
