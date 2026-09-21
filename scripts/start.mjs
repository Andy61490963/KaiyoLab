import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const secretsDirectory = process.env.SECRETS_DIR || '/run/kaiyo-secrets';
async function secret(name) {
  const value = (await readFile(join(secretsDirectory, name), 'utf8')).trim();
  if (value.length < 32) throw new Error(`密鑰 ${name} 無效。`);
  return value;
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `postgresql://kaiyo:${encodeURIComponent(await secret('pg-password'))}@db:5432/kaiyolab`;
}
process.env.BETTER_AUTH_SECRET ||= await secret('auth-secret');
process.env.SETUP_TOKEN ||= await secret('setup-token');
process.env.SITE_URL ||= 'http://localhost:4321';
process.env.BETTER_AUTH_URL ||= process.env.SITE_URL;
process.env.HOST ||= '0.0.0.0';
process.env.PORT ||= '4321';

// 維護指令也使用相同密鑰，避免操作者手動抄寫敏感資訊。
const maintenance = process.argv.slice(2);
if (maintenance.length && maintenance[0] !== 'recover') {
  throw new Error('未知的維護指令；支援 recover。');
}

function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: 'inherit', env: process.env });
    const forward = (signal) => child.kill(signal);
    const onTerm = () => forward('SIGTERM');
    const onInt = () => forward('SIGINT');
    process.on('SIGTERM', onTerm);
    process.on('SIGINT', onInt);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      process.off('SIGTERM', onTerm);
      process.off('SIGINT', onInt);
      if (code === 0) resolve();
      else reject(new Error(`程序 ${file} 失敗（${signal || code}）。`));
    });
  });
}

if (maintenance[0] === 'recover') {
  await run(process.execPath, ['scripts/recover.mjs', ...maintenance.slice(1)]);
} else {
  await run(process.execPath, ['scripts/migrate.mjs']);
  const { default: pg } = await import('pg');
  const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await database.connect();
    const result = await database.query('SELECT setup_complete FROM system_state WHERE id = 1');
    if (!result.rows[0]?.setup_complete) {
      console.log(`首次設定網址：${process.env.SITE_URL}/setup`);
      console.log(`一次性初始化碼：${process.env.SETUP_TOKEN}`);
    }
  } finally {
    await database.end();
  }
  await run(process.execPath, ['dist/server/entry.mjs']);
}
