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

function mapRows(rows: any[]) {
  return rows.map((r) => ({
    id: r.id ?? Math.random().toString(36),
    title: r.title || 'Untitled',
    content: (r.content || '').slice(0, 200) + '...',
    url: r.url || '#',
    score: r.score != null ? Number(r.score).toFixed(4) : undefined,
  }));
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ message: 'Use POST method for search' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const { query } = await context.request.json();

    if (!query || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const searchTerm = query.trim();
    const dbUrl = context.env.DATABASE_URL;

    if (!dbUrl) {
      return new Response(
        JSON.stringify({
          error: 'DATABASE_URL not configured',
          detail: 'Set DATABASE_URL as a Pages environment variable / secret.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const sql = neon(dbUrl);

    // 1) 语义搜索：Workers AI 免费 embedding + Neon pgvector 余弦
    let embedding: number[] | undefined;
    if (context.env.AI) {
      try {
        const aiRes: any = await context.env.AI.run(EMBED_MODEL, { text: [searchTerm] });
        embedding = embeddingOf(aiRes);
      } catch (aiError) {
        console.warn('AI embedding failed, falling back to keyword:', aiError);
      }
    }

    if (embedding) {
      try {
        const semantic = await sql`
          SELECT id, title, content, url, category,
                 1 - (embedding <=> ${vectorLiteral(embedding)}::vector) AS score
            FROM pages
           WHERE embedding IS NOT NULL
           ORDER BY embedding <=> ${vectorLiteral(embedding)}::vector
           LIMIT 5`;
        if (semantic.length > 0) {
          return new Response(
            JSON.stringify({ query: searchTerm, mode: 'semantic', results: mapRows(semantic) }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
      } catch (vecError) {
        console.warn('pgvector query failed, falling back to keyword:', vecError);
      }
    }

    // 2) 关键词搜索：ILIKE 兜底
    const term = `%${searchTerm}%`;
    const keyword = await sql`
      SELECT id, title, content, url, category, 1 AS score
        FROM pages
       WHERE title ILIKE ${term} OR content ILIKE ${term} OR category ILIKE ${term}
       LIMIT 5`;
    if (keyword.length > 0) {
      return new Response(
        JSON.stringify({ query: searchTerm, mode: 'keyword', results: mapRows(keyword) }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3) 示例兜底（表为空时）
    return new Response(
      JSON.stringify({
        query: searchTerm,
        mode: 'fallback',
        hint: 'Run POST /api/seed to generate pgvector embeddings, then retry.',
        results: [
          {
            id: '1',
            title: 'GitHub + Cloudflare + Neon 全栈指南',
            content: '用 GitHub Actions 双部署到 Cloudflare Pages 与 GitHub Pages，Neon pgvector 提供 AI 语义搜索。',
            url: '/',
            score: '1.0000',
          },
        ],
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Search error:', error);
    return new Response(
      JSON.stringify({ error: 'Search failed', details: error?.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}