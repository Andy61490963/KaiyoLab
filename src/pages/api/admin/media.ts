import type { APIRoute } from 'astro';
import { listAdminMedia } from '../../../lib/admin-listing';
import { errorResponse, json } from '../../../lib/http';
import { ALL as legacy } from './[...path]';

export const GET: APIRoute = async ({ url }) => {
  try { return json(await listAdminMedia(url.searchParams)); }
  catch (error) { return errorResponse(error); }
};
// Retain the existing validated image-upload flow and its request context.
export const ALL: APIRoute = (context) => legacy({ ...context, params: { ...context.params, path: 'media' } });
