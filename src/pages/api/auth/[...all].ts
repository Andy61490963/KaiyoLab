import type { APIRoute } from 'astro';
import { getAuth } from '../../../lib/auth';
export const ALL: APIRoute = ({ request, clientAddress }) => {
  const headers = new Headers(request.headers);
  headers.set('x-kaiyo-client-ip', clientAddress || '127.0.0.1');
  return getAuth().handler(new Request(request, { headers }));
};
