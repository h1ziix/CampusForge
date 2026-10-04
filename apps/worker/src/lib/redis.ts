/**
 * CampusForge Worker — Redis connection factory.
 *
 * Provides a shared IORedis instance for BullMQ workers.
 * Configuration comes from REDIS_URL environment variable.
 */
import IORedis from 'ioredis';

let _connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // Required by BullMQ
    });
  }
  return _connection;
}
