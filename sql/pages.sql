-- 场景5：GitHub Pages + Cloudflare + Neon — 幂等迁移脚本
-- 用法: psql "$DATABASE_URL" -f sql/pages.sql   或在 CI 中自动执行

CREATE EXTENSION IF NOT EXISTS vector;

-- 原有 visits 表（与 drizzle schema 保持一致）
CREATE TABLE IF NOT EXISTS visits (
  id SERIAL PRIMARY KEY,
  path TEXT NOT NULL,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 语义搜索文档表
CREATE TABLE IF NOT EXISTS pages (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'docs',
  embedding vector(1024),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pages ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- HNSW 向量索引（pgvector >= 0.5）
CREATE INDEX IF NOT EXISTS pages_embedding_hnsw_idx
  ON pages USING hnsw (embedding vector_cosine_ops);

INSERT INTO pages (title, content, url, category) VALUES
('GitHub + Cloudflare + Neon 全栈指南',
 '本仓库演示如何用 GitHub Actions 构建，推送到两个免费全球平台：Cloudflare Pages（主站）与 GitHub Pages（镜像），并让 Neon PostgreSQL 通过边缘连接提供 AI 语义搜索。',
 '/', 'guide'),
('GitHub Actions CI/CD 双部署',
 'workflow 在 main 分支触发：lint + test（pgvector 就绪的 Postgres 服务）+ build → Cloudflare Pages 生产环境 + GitHub Pages 镜像。构建时注入 NEXT_PUBLIC_BASE_PATH 使子路径下 _next 资源可加载。',
 '/docs/ci', 'guide'),
('Neon pgvector 语义搜索',
 'pages 表带 vector(1024) 列与 HNSW 索引；搜索函数用 Cloudflare Workers AI @cf/baai/bge-m3 生成查询向量，ORDER BY embedding <=> $vector 余弦排序；无向量时自动降级 ILIKE 关键词。',
 '/docs/search', 'guide'),
('Cloudflare Workers AI 免费 embedding',
 '[[ai]] binding = "AI" 后可在边缘直接调用 embedding 模型，无需任何 API key；/api/seed 会为未嵌入的文档批量生成向量回填 Neon。',
 '/docs/workers-ai', 'guide'),
('Neon 连接与连接池',
 '生产用 -pooler 连接串 + sslmode=require。数据库路由暴露 DATABASE_URL 与 Redis 凭据；建议把密钥一律存 GitHub/Cloudflare Secrets，禁止把连接串明文写进仓库。',
 '/docs/neon', 'guide')
ON CONFLICT (url) DO NOTHING;