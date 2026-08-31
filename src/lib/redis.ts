import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
  username: 'default',
  password: process.env.REDIS_PASSWORD,
});

export async function getCached(key: string) {
  try {
    const cached = await redis.get(key);
    return cached;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
}

export async function setCached(key: string, value: unknown, ttl: number = 3600) {
  try {
    await redis.set(key, JSON.stringify(value), { ex: ttl });
    return true;
  } catch (error) {
    console.error('Redis set error:', error);
    return false;
  }
}

export async function deleteCached(key: string) {
  try {
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
