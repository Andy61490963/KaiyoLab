import type { APIRoute } from 'astro';
import { getPool } from '../../lib/db';
import { json } from '../../lib/http';
export const GET: APIRoute = async () => {
  try {
    await getPool().query('SELECT 1');
    // Whitelist this one deployment receipt; never expose arbitrary environment values,
    // credentials, draft IDs, titles or article bodies through the public health check.
    const receipt = /^commit-stories-20261001:(applied|already-applied):([0-5]):([0-5])$/.exec(
      process.env.KAIYO_CONTENT_SEED_RECEIPT || '',
    );
    const validReceipt = receipt &&
      (receipt[1] === 'already-applied' || Number(receipt[2]) + Number(receipt[3]) === 5);
    const contentSeed = validReceipt ? {
      batch: 'commit-stories-20261001',
      status: receipt[1],
      ...(receipt[1] === 'applied' ? {
        created: Number(receipt[2]),
        preserved: Number(receipt[3]),
      } : {}),
    } : null;
    return json({
      status: 'ok',
      revision: import.meta.env.KAIYO_BUILD_SHA,
      ...(contentSeed ? { contentSeed } : {}),
    });
  } catch {
    return json({ status: 'unavailable' }, 503);
  }
};
