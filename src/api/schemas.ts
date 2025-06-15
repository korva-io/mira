export const API_PREFIX = '/api/v1';

export const errorResponseSchema = {
    type: 'object',
    properties: {
        error: { type: 'string' },
        code: { type: 'string' },
    },
} as const;

export const healthResponseSchema = {
    type: 'object',
    properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time' },
        version: { type: 'string', example: '1.0.0' },
    },
} as const; 