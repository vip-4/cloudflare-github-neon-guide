export default function Home() {
  return (
    <main style={{ padding: '2rem', maxWidth: '720px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Cloudflare + GitHub + Neon Guide
      </h1>
      <p style={{ color: '#555', marginBottom: '1.5rem' }}>
        This project demonstrates a full-stack deployment workflow using Cloudflare Pages, GitHub Actions, and Neon PostgreSQL.
      </p>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>What this covers</h2>
        <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.7 }}>
          <li>GitHub repository setup and branch protection</li>
          <li>Neon PostgreSQL provisioning and connection pooling</li>
          <li>Cloudflare Pages deployment with custom domain</li>
          <li>GitHub Actions CI/CD pipeline</li>
          <li>Secrets management across GitHub, Neon, and Cloudflare</li>
        </ul>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Quick start</h2>
        <pre
          style={{
            background: '#0f172a',
            color: '#e2e8f0',
            padding: '1rem',
            borderRadius: '0.5rem',
            overflowX: 'auto',
          }}
        >
          {`# 1. Clone and install
git clone https://github.com/<your-org>/<repo>.git
cd <repo>
npm install

# 2. Create a Neon database and copy the connection string
# 3. Add DATABASE_URL to GitHub repository secrets
# 4. Push to GitHub to trigger the workflow
git push origin main`}
        </pre>
      </section>

      <section>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Live demo</h2>
        <p style={{ color: '#555' }}>
          After deployment, visit the Cloudflare Pages URL to verify the static site is live.
        </p>
      </section>
    </main>
  );
}
