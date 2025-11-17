import { FastifyPluginAsync } from 'fastify';
import { API_PREFIX, healthResponseSchema } from '../schemas';
import { SchemaExtractor } from '../../infrastructure/database/schemaExtractor';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    `${API_PREFIX}/health`,
    {
      schema: {
        tags: ['health'],
        summary: 'Health check endpoint',
        description: 'Returns the current health status of the API',
        response: {
          200: {
            description: 'Successful response',
            ...healthResponseSchema,
          },
        },
      },
    },
    () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      };
    }
  );

  // Test database connection endpoint
  fastify.post<{
    Body: { connectionString: string };
  }>(
    `${API_PREFIX}/test-connection`,
    {
      schema: {
        tags: ['health'],
        summary: 'Test database connection',
        description: 'Tests if a database connection string is valid',
        body: {
          type: 'object',
          required: ['connectionString'],
          properties: {
            connectionString: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              dbType: { type: 'string', enum: ['postgres', 'mongodb'] },
              schema: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
              details: { type: 'object' },
            },
          },
          500: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
              details: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { connectionString } = request.body;
      const extractor = new SchemaExtractor();

      try {
        // Détecter automatiquement le type de base de données
        const dbType = connectionString.includes('postgres') ? 'postgres' : 'mongodb';
        
        const result = await extractor.extractSchema(connectionString);

        if (result.isOk()) {
          return {
            success: true,
            dbType, // Retourne le type de base de données détecté
            message: `Successfully connected to ${dbType} database`,
            schema: result.value.substring(0, 500) + '...', // Preview
          };
        } else {
          return reply.status(500).send({
            success: false,
            error: result.error.message,
            details: result.error.details,
          });
        }
      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          error: error.message,
          details: { stack: error.stack },
        });
      }
    }
  );
};

export default healthRoutes;
