import type { APIRoute } from 'astro';
import { getPool } from '../../lib/db';
import { json } from '../../lib/http';
export const GET: APIRoute = async () => {
  try {
    await getPool().query('SELECT 1');
    return json({ status: 'ok', revision: import.meta.env.KAIYO_BUILD_SHA });
  } catch {
    return json({ status: 'unavailable' }, 503);
  }
};
