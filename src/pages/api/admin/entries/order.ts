import type { APIRoute } from 'astro';
import { body, errorResponse, json } from '../../../../lib/http';
import {
  entryOrderInput,
  entryOrderKind,
  getEntryOrder,
  moveEntry,
} from '../../../../lib/entry-order';

// 權限與寫入來源沿用 /api/admin 的伺服器 middleware
export const GET: APIRoute = async ({ url }) => {
  try {
    const kind = entryOrderKind.parse(url.searchParams.get('kind'));
    return json(await getEntryOrder(kind));
  } catch (error) {
    return errorResponse(error);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const input = entryOrderInput.parse(await body(request));
    return json(await moveEntry(input));
  } catch (error) {
    return errorResponse(error);
  }
};
