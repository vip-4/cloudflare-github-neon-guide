# Full-Stack Deployment Guide: Cloudflare Pages + GitHub Actions + Neon PostgreSQL

## Overview

This guide covers deploying a Next.js full-stack application using:
- **GitHub** — Source control, secrets management, and CI/CD via GitHub Actions
- **Neon** — Serverless PostgreSQL database with branching and connection pooling
- **Cloudflare Pages** — Static hosting with edge network, preview deployments, and custom domains

## Prerequisites

- GitHub account with CLI authenticated (`gh auth login`)
- Cloudflare account with Pages enabled
- Neon account with CLI authenticated (`neonctl login`)
- Node.js 20+ and npm installed
- Git installed

---

## 1. GitHub Integration

### 1.1 Repository Setup

1. **Create a new GitHub repository** (public or private):
   ```powershell
   gh repo create my-fullstack-app --public --source=. --remote=origin --push
   ```
   Or manually create the repo at https://github.com/new and push:
   ```powershell
   git remote add origin https://github.com/<your-org>/<repo>.git
   git push -u origin main
   ```

2. **Configure branch protection** (recommended):
   - Go to Settings → Branches → Add rule
   - Branch name pattern: `main`
   - Enable: Require pull request before merging, Require status checks to pass
   - Add required status checks: `lint`, `test`

### 1.2 GitHub Secrets

Store sensitive configuration in GitHub Secrets (Settings → Secrets and variables → Actions → New repository secret):

| Secret | Description | How to Obtain |
|--------|-------------|---------------|
| `DATABASE_URL` | Neon PostgreSQL connection string | Neon Console → Project → Connection Details |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | Cloudflare Dashboard → My Profile → API Tokens → Create Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | Cloudflare Dashboard → Overview → Account ID |

**Cloudflare API Token Permissions:**
- Account: `Cloudflare Pages:Edit`
- Zone: `Zone:Read` (if using custom domain)

**Neon Connection String Format:**
```
postgres://user:password@ep-xyz.region.aws.neon.tech/neondb?sslmode=require
```

### 1.3 GitHub Actions CI/CD Pipeline

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run db:push
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/testdb
      - run: npm run db:seed
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/testdb
      - run: npm run build

  deploy-preview:
    if: github.event_name == 'pull_request'
    needs: [lint, test]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
    environment:
      name: preview
      url: ${{ steps.deploy.outputs.url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: my-app-preview
          directory: out
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}

  deploy-production:
    if: github.ref == 'refs/heads/main'
    needs: [lint, test]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
    environment:
      name: production
      url: ${{ steps.deploy.outputs.url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: my-app
          directory: out
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

**Workflow Explanation:**
- **lint**: Runs ESLint to catch code style issues
- **test**: Spins up a PostgreSQL service container, runs migrations and seed, then builds the app
- **deploy-preview**: Triggered on PRs; deploys to a preview environment
- **deploy-production**: Triggered on merge to `main`; deploys to production

---

## 2. Neon Database Configuration

### 2.1 Provisioning a Neon Database

1. **Create a Neon account** at https://neon.tech
2. **Create a new project**:
   ```powershell
   neonctl projects create my-fullstack-db
   ```
3. **Get the connection string**:
   ```powershell
   neonctl connection-string my-fullstack-db
   ```
   Or via the Neon Console: Project → Connection Details

4. **Create a dedicated database user** (recommended):
   ```powershell
   neonctl users create app_user --project-id <project-id>
   ```

### 2.2 Connection String Management

**Development** (`.env.local`):
```env
DATABASE_URL=postgres://app_user:password@ep-xyz.region.aws.neon.tech/neondb?sslmode=require
```

**Production** (GitHub Secret):
- Store the same `DATABASE_URL` as a GitHub repository secret
- The workflow injects it into the build/test environment

### 2.3 Database Schema Management

Use Drizzle ORM for type-safe database access:

**`drizzle.config.ts`:**
```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb',
  },
});
```

**Schema definition** (`src/lib/db/schema.ts`):
```typescript
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const visits = pgTable('visits', {
  id: serial('id').primaryKey(),
  path: text('path').notNull(),
  visitedAt: timestamp('visited_at').defaultNow().notNull(),
});

export type Visit = typeof visits.$inferSelect;
export type NewVisit = typeof visits.$inferInsert;
```

**Push migrations to Neon:**
```powershell
npm run db:push
```

**Seed data** (optional):
```typescript
// src/lib/db/seed.ts
import { db } from '@/lib/db/connection';
import { visits } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

async function seed() {
  await db.insert(visits).values({ path: '/', visitedAt: new Date() });
  console.log('Seeded successfully');
}

seed();
```

### 2.4 Application Database Connection

**`src/lib/db/connection.ts`:**
```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sqlClient = neon(process.env.DATABASE_URL);
export const db = drizzle(sqlClient);

export async function healthCheck() {
  try {
    const result = await sqlClient`SELECT 1 AS ok, now() AS timestamp`;
    return { ok: true, timestamp: result[0]?.timestamp };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}
```

**Note:** For static export (`output: 'export'`), database queries must happen at build time or be replaced with static content. For dynamic database access, use:
- Cloudflare Workers with `@neondatabase/serverless`
- Next.js API Routes on a Node.js runtime
- Client-side fetching from a separate API backend

---

## 3. Cloudflare Deployment

### 3.1 Cloudflare Pages Setup

1. **Install and authenticate Wrangler:**
   ```powershell
   npm install -g wrangler
   wrangler login
   ```

2. **Create a Pages project** via the Cloudflare Dashboard:
   - Go to https://dash.cloudflare.com → Pages → Create a project
   - Connect to your GitHub repository
   - Set production branch to `main`
   - Configure build settings:
     - Build command: `npm run build`
     - Build output directory: `out`
     - Environment variables: Add `DATABASE_URL` from Neon

3. **Or deploy via Wrangler CLI:**
   ```powershell
   wrangler pages project create my-app --production-branch main
   ```

### 3.2 Next.js Configuration for Static Export

**`next.config.mjs`:**
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  experimental: {
    serverComponentsExternalPackages: ['@neondatabase/serverless'],
  },
};

export default nextConfig;
```

**Key points:**
- `output: 'export'` generates static HTML/CSS/JS in the `out/` directory
- `images: { unoptimized: true }` disables Next.js image optimization (not available in static export)
- Server Components that use database drivers must be marked as external

### 3.3 DNS and Custom Domain

1. **Add custom domain** in Cloudflare Pages → Settings → Domains
2. **DNS Configuration** (if domain is on Cloudflare):
   - Add a CNAME record pointing to `<project-name>.pages.dev`
   - Or use Cloudflare's automatic domain mapping
3. **SSL/TLS**: Automatically provisioned by Cloudflare (Full or Full Strict mode)

### 3.4 Environment Variables in Cloudflare Pages

**Production secrets** (Cloudflare Pages → Settings → Environment variables):
- `DATABASE_URL` — Neon connection string
- Any other API keys or configuration

**Preview secrets** (for PR previews):
- Can use the same secrets or separate preview-specific values
- Set in the same Environment variables section

### 3.5 Preview Deployments

Every pull request automatically gets a unique preview URL:
```
https://<commit-hash>.<project-name>.pages.dev
```

Preview deployments are configured via the `deploy-preview` job in the GitHub Actions workflow.

---

## 4. Workflow Optimization

### 4.1 Complete CI/CD Pipeline Flow

```
Developer pushes code to GitHub branch
         ↓
GitHub Actions triggered
         ↓
    ┌────┴────┐
    ↓         ↓
  lint      test
    ↓         ↓
    └────┬────┘
         ↓
  deploy-preview (if PR)
         ↓
  deploy-production (if main)
         ↓
  Cloudflare Pages builds and deploys
         ↓
  Live at https://<project>.pages.dev
```

### 4.2 Security Best Practices

1. **Never commit secrets**:
   - Use `.gitignore` for `.env*` files
   - Store all secrets in GitHub Secrets or Cloudflare environment variables
   - Use `wrangler secret` for Workers secrets

2. **Least privilege access**:
   - Cloudflare API token: Only `Cloudflare Pages:Edit` permission
   - Neon: Use dedicated database users with minimal privileges
   - GitHub: Use fine-grained PATs with minimal scopes

3. **Database connection security**:
   - Always use `sslmode=require` in Neon connection strings
   - Enable Neon's IP allowlisting if possible
   - Use connection pooling (`@neondatabase/serverless` handles this)

4. **Timeout and resource limits**:
   - Set execution timeouts on database queries
   - Limit concurrent Cloudflare Pages builds
   - Use Neon's connection pooling to avoid exhausting connections

### 4.3 Performance Optimization

1. **Build caching**:
   ```yaml
   - uses: actions/setup-node@v4
     with:
       node-version: 20
       cache: npm  # Caches node_modules
   ```

2. **Parallel jobs**:
   ```yaml
   jobs:
     lint:
       ...
     test:
       ...
     deploy:
       needs: [lint, test]  # Runs after both succeed
   ```

3. **Neon branching** (for staging):
   ```powershell
   # Create a preview branch for each PR
   neonctl branches create preview-<pr-number> --project-id <project-id>
   ```

4. **Cloudflare caching**:
   - Enable Cloudflare Cache for static assets
   - Set appropriate `Cache-Control` headers
   - Use `wrangler pages project settings` to configure caching rules

### 4.4 Monitoring and Observability

1. **GitHub Actions logs**: Built-in workflow run logs
2. **Cloudflare Analytics**: Pages → Analytics → View traffic, performance
3. **Neon monitoring**: Query performance, connection count, storage usage
4. **Application logging**: Use `console.log` in Next.js; view in Cloudflare Pages logs

### 4.5 Rollback Strategy

1. **GitHub**: Revert the commit and push
   ```powershell
   git revert HEAD
   git push origin main
   ```

2. **Cloudflare Pages**: Rollback to a previous deployment
   - Pages → Deployments → Select previous deployment → Rollback

3. **Neon Database**: Use Neon branches for point-in-time recovery
   ```powershell
   neonctl branches create rollback-$(date +%s) --project-id <project-id>
   ```

### 4.6 Multi-Environment Setup

```
GitHub Branches:
  main       → Production (Cloudflare Pages production)
  staging    → Staging (Cloudflare Pages preview)
  feature/*  → Preview (Cloudflare Pages preview per PR)

Neon Branches:
  main       → Production database
  staging    → Staging database
  preview/*  → Preview database per PR

Cloudflare Pages:
  Production project: my-app
  Preview project: my-app-preview
```

### 4.7 Troubleshooting Common Issues

| Issue | Solution |
|-------|----------|
| Build fails with `DATABASE_URL not found` | Verify GitHub secret is set at repo level (not environment) |
| Cloudflare Pages build timeout | Increase build timeout in Pages settings, or optimize Next.js build |
| Neon connection refused | Check `sslmode=require`, verify IP allowlist, check connection pooling |
| Preview deployment not triggered | Verify branch protection rules, check Actions permissions |
| TypeScript errors in build | Ensure `skipLibCheck: true` in `tsconfig.json`, run `npm run lint` locally |

---

## 5. Local Development Setup

1. **Clone the repository:**
   ```powershell
   git clone https://github.com/<your-org>/<repo>.git
   cd <repo>
   ```

2. **Install dependencies:**
   ```powershell
   npm install
   ```

3. **Set up local environment:**
   ```powershell
   Copy-Item .env.example .env.local
   # Edit .env.local with your Neon connection string
   ```

4. **Run database migrations:**
   ```powershell
   npm run db:push
   ```

5. **Start development server:**
   ```powershell
   npm run dev
   ```

6. **Run tests:**
   ```powershell
   # Start local PostgreSQL or use Neon
   $env:DATABASE_URL = "postgres://test:test@localhost:5432/testdb"
   npm run db:push
   npm run build
   ```

---

## 6. Cost Estimation

| Service | Free Tier | Production Estimate |
|---------|-----------|---------------------|
| GitHub | Free for public repos | Free for private repos with Actions |
| GitHub Actions | 500 MB storage, 2,000 minutes/month | $0.008/minute after free tier |
| Neon | 10 GB storage, 100 hours compute/month | ~$0.10/GB storage, $0.10/hour compute |
| Cloudflare Pages | 500 builds/month, 100 GB bandwidth | $0.50/build after free, $1/GB bandwidth |
| **Total** | **$0/month for small projects** | **~$5-20/month for moderate traffic** |

---

## 7. References

- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Neon Documentation](https://neon.tech/docs)
- [GitHub Actions Documentation](https://docs.github.com/actions)
- [Next.js Deployment Guide](https://nextjs.org/docs/app/building-your-application/deploying)
- [Pydantic Documentation](https://docs.pydantic.dev/)
