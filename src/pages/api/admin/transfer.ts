import type { APIRoute } from 'astro';
import {
  decodeArchive,
  exportArchive,
  importArchive,
  previewImport,
  readArchiveRequest,
} from '../../../lib/portability';
import { errorResponse, HttpError, json } from '../../../lib/http';

// 所有請求先經 /api/admin middleware 驗證站長；POST 同時驗證 Origin
let active = false;
export const ALL: APIRoute = async ({ request, url }) => {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  if (active)
    return json(
      { error: 'Another content transfer is running. Try again after it finishes.' },
      409,
    );
  active = true;
  try {
    if (request.method === 'GET') {
      const archive = await exportArchive();
      return new Response(new Uint8Array(archive), {
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Disposition': `attachment; filename="kaiyolab-${new Date().toISOString().slice(0, 10)}.kaiyo.json.gz"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    const action = url.searchParams.get('action');
    if (!['preview', 'import'].includes(action || ''))
      throw new HttpError(400, 'Choose preview or import.');
    const applySettings = url.searchParams.get('settings') === '1';
    const loaded = await decodeArchive(await readArchiveRequest(request));
    if (action === 'preview') return json(await previewImport(loaded, applySettings));
    const review = url.searchParams.get('review') || '';
    if (!/^[a-f0-9]{64}$/.test(review))
      throw new HttpError(400, 'Check the archive before importing.');
    return json(await importArchive(loaded, review, applySettings), 201);
  } catch (error) {
    return errorResponse(error);
  } finally {
    active = false;
  }
};
