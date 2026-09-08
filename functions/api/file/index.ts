type Env = {
  R2_STORE?: any;
};

const EXT_MIME: Record<string, string> = {
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
};

function guessType(key: string): string {
  const dot = key.lastIndexOf('.');
  const ext = dot >= 0 ? key.slice(dot).toLowerCase() : '';
  return EXT_MIME[ext] || 'application/octet-stream';
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  try {
    const url = new URL(context.request.url);
    const key = (url.searchParams.get('key') || '').replace(/^\/+/, '').trim();
    if (!key) {
      return new Response(JSON.stringify({ error: 'key is required (e.g. /api/file?key=demo/sample.txt)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!context.env.R2_STORE) {
      return new Response(JSON.stringify({ error: 'R2 binding not configured', key }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const object = await context.env.R2_STORE.get(key);
    if (!object) {
      return new Response(JSON.stringify({ error: 'Not found', key }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const contentType =
      object.httpMetadata?.contentType || guessType(key);
    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: object.httpEtag || object.etag || '',
      'X-R2-Size': String(object.size),
    });

    return new Response(object.body, { headers });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'R2 read failed', details: error?.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const onRequestPost = onRequestGet;
export const onRequestPut = onRequestGet;
export const onRequestDelete = onRequestGet;
