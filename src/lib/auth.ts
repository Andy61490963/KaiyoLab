import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { db, schema, secret } from './db';
export function createAuth(database: ReturnType<typeof db>, setup = false) {
  const authSecret = secret('auth-secret', 'BETTER_AUTH_SECRET');
  if (authSecret.length < 32) throw new Error('尚未設定驗證密鑰，請先初始化 secrets。');
  return betterAuth({
    database: drizzleAdapter(database, { provider: 'pg', schema, transaction: false }),
    secret: authSecret,
    baseURL: process.env.SITE_URL || 'http://localhost:4321',
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 5 } },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ['x-kaiyo-client-ip'] },
      useSecureCookies: (process.env.SITE_URL || '').startsWith('https://'),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-up/email' && !setup)
          throw new APIError('FORBIDDEN', { message: '此網站不開放註冊。' });
      }),
    },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (instance ||= createAuth(db()));
}
