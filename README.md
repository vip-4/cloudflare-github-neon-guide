# Full-Stack Deployment Guide: Cloudflare Pages + GitHub + Neon

This repository contains a complete, production-ready guide and reference implementation for deploying a full-stack application using:

- **GitHub** — source control, secrets management, and CI/CD via GitHub Actions
- **Neon** — serverless PostgreSQL with branching, connection pooling, and autoscaling
- **Cloudflare Pages** — global frontend hosting with preview deployments and edge runtime

## Architecture

```
GitHub Repository
  ├── main branch → production deployment
  ├── pull requests → preview deployments
  └── GitHub Actions → lint, test, build, deploy
         │
         ▼
Neon PostgreSQL
  ├── Production branch
  ├── Preview branches (per PR)
  └── Connection pooling via pgbouncer
         │
         ▼
Cloudflare Pages
  ├── Production site (custom domain)
  ├── Preview sites (per PR)
  └── Environment variables / secrets
```

## Prerequisites

- A GitHub account
- A Cloudflare account with Pages enabled
- A Neon account with a PostgreSQL project
- Node.js 20+ and npm installed locally

## Step 1: GitHub Repository Setup

### 1.1 Create the Repository

```bash
# Create a new repository on GitHub, then clone it locally
git clone https://github.com/<your-org>/<repo>.git
cd <repo>

# Copy this project's files into the repository
# Or use this repository as a template
```

### 1.2 Configure Branch Protection

Navigate to **GitHub → Settings → Branches → Branch protection rules** and add a rule for `main`:

| Setting | Value |
|---------|-------|
| Require a pull request before merging | ✅ Required |
| Require approvals | ✅ 1 approval |
| Require status checks to pass | ✅ `lint`, `test` |
| Require conversation resolution | ✅ Enabled |
| Require signed commits | Optional |
| Include administrators | ✅ Enabled |

### 1.3 Add GitHub Secrets

Navigate to **GitHub → Settings → Secrets and variables → Actions** and add:

| Secret | Description | Where to get it |
|--------|-------------|-----------------|
| `DATABASE_URL` | Neon PostgreSQL connection string | Neon Dashboard → Connection Details |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | Cloudflare Dashboard → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | Cloudflare Dashboard → Overview → Account ID |

### 1.4 Configure Environments

Navigate to **GitHub → Settings → Environments**:

**Production environment:**
- Protection rules: Required reviewers (team leads)
- Deployment branches: `main` only

**Preview environment:**
- Protection rules: None (or optional reviewers)
- Deployment branches: All branches except `main`

## Step 2: Neon Database Configuration

### 2.1 Provision a Neon PostgreSQL Instance

1. Sign up at [neon.tech](https://neon.tech)
2. Create a new project:
   - Name: `fullstack-guide`
   - Region: Choose the region closest to your users (e.g., `us-east-2`)
   - PostgreSQL version: Latest stable
3. After creation, navigate to **Connection Details**

### 2.2 Connection String Formats

Neon provides two connection modes:

**Direct connection (development):**
```
postgres://neondb_owner:npg_M4PQLswtKh0o@ep-muddy-paper-ax88sn38-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

**Pooled connection (production/serverless):**
```
postgres://neondb_owner:npg_M4PQLswtKh0o@ep-muddy-paper-ax88sn38-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

**Important parameters:**
- `sslmode=require` — Enforce TLS encryption
- `channel_binding=require` — Require SCRAM-SHA-256 channel binding
- `-pooler` suffix — Uses PgBouncer for connection pooling

### 2.3 Database Schema

Create `src/lib/db/schema.ts`:

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

### 2.4 Database Connection

Create `src/lib/db/connection.ts`:

```typescript
import { NeonDatabase } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sqlClient = new NeonDatabase(process.env.DATABASE_URL);
export const db = drizzle(sqlClient);

export async function healthCheck() {
  try {
    const result = await sql`SELECT 1 AS ok, now() AS timestamp`;
    return { ok: true, timestamp: result[0]?.timestamp };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}
```

### 2.5 Run Migrations

```bash
# Generate migrations
npm run db:generate

# Apply migrations to Neon
npm run db:push
```

### 2.6 Seed Data

Create `src/lib/db/seed.ts`:

```typescript
import { db } from '@/lib/db/connection';
import { visits } from '@/lib/db/schema';

async function seed() {
  const paths = ['/', '/about', '/contact', '/api/hello'];
  for (const path of paths) {
    await db.insert(visits).values({ path }).onConflictDoNothing();
  }
  console.log('Seed completed');
}

seed().catch((error) => {
  console.error('Seed failed', error);
  process.exit(1);
});
```

Run seed:
```bash
npm run db:seed
```

## Step 3: Application Code

### 3.1 API Route with Database Integration

Create `src/app/api/hello/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { visits } from '@/lib/db/schema';

export async function GET() {
  const health = await (await import('@/lib/db/connection')).healthCheck();

  if (!health.ok) {
    return NextResponse.json({ status: 'error', database: 'unreachable' }, { status: 503 });
  }

  try {
    const [row] = await db.insert(visits).values({ path: '/api/hello' }).returning();
    return NextResponse.json({ status: 'ok', database: 'connected', visit: row });
  } catch (error) {
    return NextResponse.json({ status: 'error', database: 'query_failed', error: String(error) }, { status: 500 });
  }
}
```

### 3.2 Frontend Page

Create `src/app/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [status, setStatus] = useState<string>('checking...');

  useEffect(() => {
    fetch('/api/hello')
      .then((res) => res.json())
      .then((data) => setStatus(`${data.status} — database: ${data.database}`))
      .catch(() => setStatus('failed'));
  }, []);

  return (
    <main style={{ padding: '2rem', maxWidth: '720px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Full-Stack Deployment Guide
      </h1>
      <p style={{ color: '#555', marginBottom: '1.5rem' }}>
        Cloudflare Pages + GitHub Actions + Neon PostgreSQL
      </p>
      <section>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>API Health</h2>
        <p style={{ fontFamily: 'monospace', background: '#f5f5f5', padding: '0.75rem', borderRadius: '0.375rem' }}>
          {status}
        </p>
      </section>
    </main>
  );
}
```

## Step 4: Cloudflare Pages Deployment

### 4.1 Create a Cloudflare Pages Project

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages → Pages**
3. Click **Create a project** → **Connect to Git**
4. Authorize Cloudflare to access your GitHub account
5. Select your repository and branch (`main`)

### 4.2 Configure Build Settings

| Setting | Value |
|---------|-------|
| **Build command** | `npm run build` |
| **Build output directory** | `out` |
| **Node.js version** | `20` |

### 4.3 Configure Environment Variables

In **Cloudflare Pages → Settings → Environment variables**, add:

| Variable | Value | Environment |
|----------|-------|-------------|
| `DATABASE_URL` | `postgres://...` | Production, Preview |

**Important:** Use the pooled connection string for production.

### 4.4 Configure Custom Domain

1. In **Cloudflare Pages → Custom domains**, add your domain
2. Cloudflare will automatically create the necessary DNS records
3. Wait for DNS propagation (usually < 5 minutes)

### 4.5 Enable Preview Deployments

Cloudflare Pages automatically creates preview deployments for every pull request. No additional configuration is needed.

## Step 5: GitHub Actions CI/CD Pipeline

### 5.1 Workflow File

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
      - run: npm run build

  deploy-preview:
    if: github.event_name == 'pull_request'
    needs: [lint, test]
    runs-on: ubuntu-latest
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
          projectName: fullstack-guide-preview
          directory: out
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}

  deploy-production:
    if: github.ref == 'refs/heads/main'
    needs: [lint, test]
    runs-on: ubuntu-latest
    environment: production
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
          projectName: fullstack-guide
          directory: out
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

### 5.2 Workflow Triggers

| Trigger | Branch | Deployment |
|---------|--------|------------|
| Push to `main` | `main` | Production |
| Pull request | Feature branch | Preview |
| Manual dispatch | Any | Optional |

## Step 6: Workflow Optimization & Best Practices

### 6.1 Secrets Management

| Platform | Recommended Approach |
|----------|---------------------|
| **GitHub** | Use repository secrets for `DATABASE_URL`, `CLOUDFLARE_API_TOKEN` |
| **Neon** | Use Neon's built-in secret management; rotate keys quarterly |
| **Cloudflare** | Use Cloudflare Pages environment variables; never commit `.env` files |

**Never store secrets in:**
- Source code
- GitHub Actions logs
- Docker images
- Public configuration files

### 6.2 Database Connection Best Practices

```typescript
// ✅ Good: Use pooled connection in production
const sqlClient = new NeonDatabase(process.env.DATABASE_URL);

// ✅ Good: Health check before queries
const health = await healthCheck();
if (!health.ok) return NextResponse.json({ error: 'DB down' }, { status: 503 });

// ✅ Good: Use connection pooling for serverless
// Neon's -pooler endpoint handles this automatically

// ❌ Bad: Hardcoded credentials
// const db = new NeonDatabase('postgres://user:pass@host/db');

// ❌ Bad: No error handling
// const result = await db.select();
```

### 6.3 Deployment Pipeline Optimization

| Practice | Implementation |
|----------|---------------|
| **Parallel jobs** | `lint`, `test`, `deploy-preview` run in parallel |
| **Caching** | `actions/setup-node` with `cache: npm` |
| **Conditional deploys** | Only deploy preview on PRs, production on `main` |
| **Status checks** | Require `lint` and `test` to pass before deploy |
| **Environment gates** | Production deploys require manual approval |

### 6.4 Monitoring and Observability

**Cloudflare Pages:**
- Enable **Analytics** in Cloudflare Dashboard
- Set up **Web Analytics** for visitor tracking
- Configure **Error Analytics** for 4xx/5xx tracking

**Neon:**
- Enable **Query History** in Neon Dashboard
- Set up **Alerts** for high latency or connection limits
- Use **Branching** for development/staging environments

**GitHub Actions:**
- Enable **Workflow run artifacts** for build logs
- Set up **Notifications** for failed workflows
- Use **Deployments API** for deployment tracking

### 6.5 Security Checklist

- [ ] `DATABASE_URL` is stored in GitHub Secrets, not in code
- [ ] `CLOUDFLARE_API_TOKEN` has minimal permissions (Pages:Edit only)
- [ ] Neon connection uses `sslmode=require`
- [ ] Branch protection is enabled on `main`
- [ ] Dependencies are audited regularly (`npm audit`)
- [ ] `.env` files are in `.gitignore`
- [ ] Preview deployments don't inherit production secrets (use separate Neon branches)

## Step 7: Verification

### 7.1 Local Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Neon connection string

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

Visit `http://localhost:3000` and verify:
- [ ] Page loads without errors
- [ ] `/api/hello` returns `{"status":"ok","database":"connected"}`
- [ ] Database records are being created

### 7.2 CI/CD Verification

1. Push a feature branch:
   ```bash
   git checkout -b feature/test-deployment
   git push origin feature/test-deployment
   ```

2. Open a pull request on GitHub

3. Verify in GitHub Actions:
   - [ ] `lint` job passes
   - [ ] `test` job passes
   - [ ] `deploy-preview` job creates a preview URL

4. Visit the preview URL and verify:
   - [ ] Page loads
   - [ ] API connects to Neon database

5. Merge the pull request to `main`

6. Verify production deployment:
   - [ ] `deploy-production` job completes
   - [ ] Production site is updated
   - [ ] Custom domain resolves correctly

## Troubleshooting

### Database Connection Issues

| Error | Cause | Solution |
|-------|-------|----------|
| `connection refused` | Wrong host/port | Verify Neon connection string |
| `password authentication failed` | Incorrect credentials | Reset password in Neon Dashboard |
| `SSL error` | Missing `sslmode=require` | Add SSL parameters to connection string |
| `too many connections` | Exceeded connection limit | Use `-pooler` endpoint or upgrade plan |

### Deployment Failures

| Error | Cause | Solution |
|-------|-------|----------|
| `build failed` | Missing dependencies | Check `npm run build` locally first |
| `CLOUDFLARE_API_TOKEN invalid` | Token expired or wrong permissions | Regenerate token in Cloudflare Dashboard |
| `DATABASE_URL not found` | Secret not configured | Add secret to GitHub repository settings |

### Preview Deployment Issues

| Error | Cause | Solution |
|-------|-------|----------|
| Preview DB not found | No Neon preview branch | Use `neonctl` to create preview branches |
| Different data from production | Preview uses separate DB | Expected behavior; sync data if needed |

## Cost Estimate

| Service | Free Tier | Production Cost |
|---------|-----------|-----------------|
| **GitHub** | Free for public repos | $0 (public) / $4/user (private) |
| **Cloudflare Pages** | 500 builds/month, unlimited bandwidth | $0 (within free tier) |
| **Neon** | 0.5 GB storage, 100 hours compute | ~$19/month for 10 GB + compute |

**Total estimated cost for small app:** $0-$20/month

## Next Steps

- Add **authentication** (Clerk, Auth0, or NextAuth.js)
- Implement **database migrations** with Drizzle ORM
- Set up **monitoring** (Cloudflare Analytics, Neon Metrics)
- Configure **custom email** with Cloudflare Email Routing
- Add **rate limiting** with Cloudflare WAF
- Enable **DDoS protection** with Cloudflare

## Resources

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Neon Documentation](https://neon.tech/docs)
- [GitHub Actions Documentation](https://docs.github.com/actions)
- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs)

## CI Trigger
- Last CI trigger: 2026-08-31 05:57:33

