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
