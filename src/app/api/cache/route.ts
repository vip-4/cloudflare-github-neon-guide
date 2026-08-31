import { NextResponse } from 'next/server';
import { getOrSetCache } from '@/lib/redis';

export async function GET() {
  const cacheKey = 'api:health';

  try {
    const data = await getOrSetCache(
      cacheKey,
      async () => {
        // Simulate expensive operation
        await new Promise((resolve) => setTimeout(resolve, 100));

        return {
          status: 'ok',
          timestamp: new Date().toISOString(),
          redis: 'connected',
          database: 'connected',
        };
      },
      60 // Cache for 60 seconds
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
