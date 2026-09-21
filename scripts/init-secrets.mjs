import { randomBytes } from 'node:crypto';
import { chmod, chown, mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = process.env.SECRETS_DIR || '/run/kaiyo-secrets';
await mkdir(directory, { recursive: true, mode: 0o750 });
for (const name of ['pg-password', 'auth-secret', 'setup-token']) {
  const path = join(directory, name);
  try {
    const handle = await open(path, 'wx', 0o640);
    try {
      await handle.writeFile(`${randomBytes(48).toString('hex')}\n`);
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if ((await readFile(path, 'utf8')).trim().length < 32) {
    throw new Error(`密鑰檔案 ${name} 無效；為避免破壞既有資料，初始化已停止。`);
  }
  await chmod(path, name === 'pg-password' ? 0o444 : 0o400);
  await chown(path, 1000, 1000);
}
await chown(directory, 1000, 1000);
await chmod(directory, 0o755);
const uploadDirectory = process.env.UPLOAD_DIR || '/app/data/uploads';
await mkdir(uploadDirectory, { recursive: true, mode: 0o750 });
await chown(uploadDirectory, 1000, 1000);
await chmod(uploadDirectory, 0o750);
console.log('密鑰及媒體儲存空間已就緒；既有密鑰保持不變。');
