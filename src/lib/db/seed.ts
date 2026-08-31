import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(DATABASE_URL);

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
