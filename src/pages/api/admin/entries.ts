import type { APIRoute } from 'astro';
import { listAdminEntries } from '../../../lib/admin-listing';
import { errorResponse, json } from '../../../lib/http';
import { ALL as legacy } from './[...path]';

// Exact collection routes take precedence over the existing catch-all.
// The same /api/admin middleware still authenticates every request.
export const GET: APIRoute = async ({ url }) => {
  try { return json(await listAdminEntries(url.searchParams)); }
  catch (error) { return errorResponse(error); }
};
// Preserve create operations; entry detail/action routes remain in the catch-all.
export const ALL: APIRoute = (context) => legacy({ ...context, params: { ...context.params, path: 'entries' } });
