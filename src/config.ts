import { z } from 'zod';

// Schema for @fastify/env
export const envSchema = {
  type: 'object',
  required: [
    'POSTGRES_CONNECTION_STRING',
    'MONGODB_CONNECTION_STRING',
    'REDIS_URL',
    'GROK_API_KEY',
  ],
  properties: {
    NODE_ENV: {
      type: 'string',
      enum: ['development', 'test', 'production'],
      default: 'development',
    },
    PORT: {
      type: 'string',
      default: '4000',
    },
    HOST: {
      type: 'string',
      default: '127.0.0.1',
    },
    POSTGRES_CONNECTION_STRING: {
      type: 'string',
    },
    MONGODB_CONNECTION_STRING: {
      type: 'string',
    },
    MONGODB_DB_NAME: {
      type: 'string',
      default: 'mira',
    },
    REDIS_URL: {
      type: 'string',
      default: 'redis://localhost:6379',
    },
    GROK_API_KEY: {
      type: 'string',
    },
    GROK_API_URL: {
      type: 'string',
      default: 'https://api.grok.ai/v1',
    },
  },
} as const;

// Zod schema for type safety
export const zodEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('4000'),
  HOST: z.string().default('127.0.0.1'),
  POSTGRES_CONNECTION_STRING: z.string(),
  MONGODB_CONNECTION_STRING: z.string(),
  MONGODB_DB_NAME: z.string().default('mira'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  GROK_API_KEY: z.string(),
  GROK_API_URL: z.string().default('https://api.grok.ai/v1'),
});

export type EnvConfig = z.infer<typeof zodEnvSchema>;

export function getConfig(): { port: number; host: string } {
  const config = process.env as unknown as EnvConfig;
  return {
    port: parseInt(config.PORT, 10),
    host: config.HOST || '127.0.0.1',
  };
} 