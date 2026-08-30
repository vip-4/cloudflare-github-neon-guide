import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function seed() {
  const paths = ['/', '/about', '/contact', '/api/hello'];
  for (const path of paths) {
    await sql`INSERT INTO visits (path) VALUES (${path}) ON CONFLICT DO NOTHING`;
  }
  console.log('Seed completed');
}

seed().catch((error) => {
  console.error('Seed failed', error);
  process.exit(1);
});
