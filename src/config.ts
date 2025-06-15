import { z } from 'zod';

export const envSchema = {
    type: 'object',
    required: ['GROK_API_KEY', 'REDIS_URL', 'LOG_DB_URL'],
    properties: {
        GROK_API_KEY: { type: 'string' },
        REDIS_URL: { type: 'string' },
        LOG_DB_URL: { type: 'string' },
        PORT: { type: 'string', default: '4000' },
        HOST: { type: 'string', default: 'localhost' },
    },
} as const;

export const getConfig = () => ({
    port: parseInt(process.env['PORT'] || '4000', 10),
    host: process.env['HOST'] || 'localhost',
    grokApiKey: process.env['GROK_API_KEY'] || '',
    redisUrl: process.env['REDIS_URL'] || '',
    logDbUrl: process.env['LOG_DB_URL'] || '',
}); 