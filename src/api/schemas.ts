import { z } from 'zod';

export const API_PREFIX = '/api/v1';

// Zod schemas for type safety
export const QueryInputSchema = z.object({
  dbType: z.enum(['postgres', 'mongodb']),
  connectionString: z
    .string()
    .min(5, { message: 'Connection string must be at least 5 characters long.' }),
  nlQuery: z
    .string()
    .min(20, { message: 'Natural language query must be at least 20 characters long.' }),
  userId: z.string().uuid({ message: 'User ID must be a valid UUID.' }),
});

export type QueryInput = z.infer<typeof QueryInputSchema>;

// JSON Schema for Fastify validation
export const queryInputJsonSchema = {
  type: 'object',
  required: ['dbType', 'connectionString', 'nlQuery', 'userId'],
  properties: {
    dbType: {
      type: 'string',
      enum: ['postgres', 'mongodb'],
    },
    connectionString: {
      type: 'string',
    },
    nlQuery: {
      type: 'string',
    },
    userId: {
      type: 'string',
    },
  },
};

export const queryResponseSchema = {
  type: 'object',
  properties: {
    data: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
};

export const errorResponseSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'string',
    },
  },
};

export const healthResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', example: 'ok' },
    timestamp: { type: 'string', format: 'date-time' },
    version: { type: 'string', example: '1.0.0' },
  },
} as const;
