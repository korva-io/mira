import { z } from 'zod';

export const API_PREFIX = '/api/v1';

// ====================
// ZOD SCHEMAS (TypeScript)
// ====================

// Configuration personnalisée pour l'analyse des données
const ConfigurationSchema = z.object({
  sort: z
    .object({
      field: z.string(),
      order: z.enum(['asc', 'desc']).optional().default('desc'),
    })
    .optional(),

  filters: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in', 'like']).optional().default('eq'),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
      })
    )
    .optional(),

  returnType: z.enum(['array', 'object', 'scalar']).optional(),
  presentation: z.enum(['table', 'list', 'single', 'empty']).optional(),
  groupBy: z.string().optional(),
  outputKeyFormat: z
    .enum(['camelCase', 'snake_case', 'PascalCase', 'kebab-case', 'original'])
    .optional()
    .default('original'),
});

export const QueryInputSchema = z.object({
  dbType: z.enum(['postgres', 'mongodb']),
  connectionString: z
    .string()
    .min(5, { message: 'Connection string must be at least 5 characters long.' }),
  nlQuery: z
    .string()
    .min(20, { message: 'Natural language query must be at least 20 characters long.' }),
  userId: z.string().uuid({ message: 'User ID must be a valid UUID.' }),
  configuration: ConfigurationSchema.optional().default({}),
});

export type QueryInput = z.infer<typeof QueryInputSchema>;

// ====================
// JSON SCHEMA (Fastify)
// ====================

export const queryInputJsonSchema = {
  type: 'object',
  required: ['dbType', 'connectionString', 'nlQuery', 'userId'],
  properties: {
    dbType: {
      type: 'string',
      enum: ['postgres', 'mongodb'],
      description: 'Type de base de données',
    },
    connectionString: {
      type: 'string',
      description: 'Chaîne de connexion à la base de données',
    },
    nlQuery: {
      type: 'string',
      description: 'Requête en langage naturel',
    },
    userId: {
      type: 'string',
      format: 'uuid',
      description: 'Identifiant unique de l’utilisateur',
    },
    configuration: {
      type: 'object',
      description: 'Configuration optionnelle pour tri, filtres, format, etc.',
      additionalProperties: true,
      properties: {
        sort: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              operator: {
                type: 'string',
                enum: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in', 'like'],
                default: 'eq',
              },
              value: { type: ['string', 'number', 'boolean', 'array'] },
            },
          },
        },
        returnType: {
          type: 'string',
          enum: ['array', 'object', 'scalar'],
        },
        presentation: {
          type: 'string',
          enum: ['table', 'list', 'single', 'empty'],
        },
        groupBy: { type: 'string' },
        outputKeyFormat: {
          type: 'string',
          enum: ['camelCase', 'snake_case', 'PascalCase', 'kebab-case', 'original'],
          default: 'original',
        },
        maxResults: {
          type: 'number',
          minimum: 1,
          maximum: 10000,
          description: 'Maximum number of results to return',
        },
        timeout: {
          type: 'number',
          minimum: 1000,
          maximum: 300000,
          description: 'Query timeout in milliseconds (1s to 5min)',
        },
      },
      default: {},
    },
  },
};

// ====================
// RÉPONSES
// ====================

export const queryResponseSchema = {
  type: 'object',
  required: ['data', 'comment'],
  properties: {
    data: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
      },
      description: 'Données brutes ou enrichies selon configuration',
    },
    comment: {
      type: 'string',
      description: 'Commentaire synthétique en français',
    },
    meta: {
      type: 'object',
      description: 'Métadonnées d’analyse (tri, filtres, complexité, etc.)',
      additionalProperties: true,
    },
  },
};

export const errorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'string',
      description: 'Message d’erreur détaillé',
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