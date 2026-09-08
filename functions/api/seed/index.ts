import { neon } from '@neondatabase/serverless';

type Env = {
  DATABASE_URL?: string;
  AI?: any;
};

const EMBED_MODEL = '@cf/baai/bge-m3';

function embeddingOf(res: any, index = 0): number[] | undefined {
  const row = res?.data?.[index];
  if (!row) return undefined;
  if (Array.isArray(row)) return row.length ? row : undefined;
  if (Array.isArray(row.embedding)) return row.embedding;
  const vals = Object.values(row);
  if (vals.length && vals.every((v) => typeof v === 'number')) return vals as number[];
  return undefined;
}

function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    if (!context.env.AI) {
      return new Response(
        JSON.stringify({
          error: 'Workers AI binding not configured',
          detail: 'Add [[ai]] binding = "AI" to wrangler.toml so the seed endpoint can produce pgvector embeddings.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { limit = 10 } = await context.request.json();
    const dbUrl = context.env.DATABASE_URL;

    if (!dbUrl) {
      return new Response(
        JSON.stringify({ error: 'DATABASE_URL not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const sql = neon(dbUrl);

    const toSeed: any[] = await sql`
      SELECT id, title, content, url FROM pages
       WHERE embedding IS NULL
       ORDER BY id
       LIMIT ${Math.min(Number(limit) || 10, 100)}`;

    let embedded = 0;
    for (const page of toSeed) {
      try {
        const aiRes: any = await context.env.AI.run(EMBED_MODEL, {
          text: [`${page.title}\n${page.content}`],
        });
        const embedding = embeddingOf(aiRes);
        if (!embedding) continue;

        await sql`
          UPDATE pages SET embedding = ${vectorLiteral(embedding)}::vector, updated_at = now()
           WHERE id = ${page.id}`;
        embedded += 1;
      } catch (embedError) {
        console.warn('Embedding failed for page', page.id, embedError);
      }
    }

    const stats = (await sql`
      SELECT count(*)::int AS total, count(embedding)::int AS with_emb FROM pages`) as any[];

    return new Response(
      JSON.stringify({
        ok: true,
        embedded,
        pending: toSeed.length - embedded,
        total: stats?.[0]?.total ?? 0,
        with_embeddings: stats?.[0]?.with_emb ?? 0,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Seed error:', error);
    return new Response(
      JSON.stringify({ error: 'Seed failed', details: error?.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}