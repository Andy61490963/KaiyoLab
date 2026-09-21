import type { APIRoute } from 'astro';
import { getPool } from '../../lib/db';
import { json } from '../../lib/http';
export const GET: APIRoute = async () => {
  try {
    await getPool().query('SELECT 1');
    return json({ status: 'ok' });
  } catch {
    return json({ status: 'unavailable' }, 503);
  }
};
