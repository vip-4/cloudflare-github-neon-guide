import { Redis } from '@upstash/redis';

const redisUrl = process.env.REDIS_URL || '';
const redisToken = process.env.REDIS_TOKEN || '';

let redis: Redis | undefined;
try {
  if (redisUrl && redisToken) {
    redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });
  }
} catch (e) {
  console.warn('Redis client init failed; cache functions will be no-ops.', e);
}

export async function getCached(key: string) {
  try {
    if (!redis) return null;
    const cached = await redis.get(key);
    return cached;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
}

export async function setCached(key: string, value: unknown, ttl: number = 3600) {
  try {
    if (!redis) return false;
    await redis.set(key, JSON.stringify(value), { ex: ttl });
    return true;
  } catch (error) {
    console.error('Redis set error:', error);
    return false;
  }
}

export async function deleteCached(key: string) {
  try {
    if (!redis) return false;
    await redis.del(key);
    return true;
  } catch (error) {
    console.error('Redis delete error:', error);
    return false;
  }
}

export async function getOrSetCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 3600
): Promise<T> {
  try {
    const cached = await getCached(key);
    if (cached) {
      return JSON.parse(cached as string);
    }

    const data = await fetcher();
    await setCached(key, data, ttl);
    return data;
  } catch (error) {
    console.error('Redis cache error:', error);
    return fetcher();
  }
}

export default redis;
