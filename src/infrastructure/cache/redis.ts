// @ts-nocheck
import { createClient } from 'redis';
import { CacheService } from '../interfaces';

export class RedisCache implements CacheService {
  private client;
  private isConnected = false;

  constructor() {
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    this.client = createClient({
      url: redisUrl,
      socket: {
        tls: true,
        rejectUnauthorized: false,
      },
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
      this.isConnected = true;
    });

    this.client.on('reconnecting', () => {
      console.log('Redis Client Reconnecting');
      this.isConnected = false;
    });

    this.connect();
  }

  private async connect() {
    try {
      await this.client.connect();
    } catch (err) {
      console.error('Failed to connect to Redis:', err);
      this.isConnected = false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isConnected) {
      console.warn('Redis not connected, skipping get operation');
      return null;
    }

    try {
      return await this.client.get(key);
    } catch (err) {
      console.error('Redis get error:', err);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.isConnected) {
      console.warn('Redis not connected, skipping set operation');
      return;
    }

    try {
      await this.client.set(key, value, {
        EX: ttlSeconds,
      });
    } catch (err) {
      console.error('Redis set error:', err);
      throw err;
    }
  }
}
