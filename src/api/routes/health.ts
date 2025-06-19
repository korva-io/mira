import { FastifyPluginAsync } from 'fastify';
import { API_PREFIX, healthResponseSchema } from '../schemas';
import { MongoRepository } from '../../infrastructure/database/mongodb';

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
    async () => {
      const mongoRepo = new MongoRepository();

      const result = await mongoRepo.healthCheckQuery(
        process.env['MONGODB_CONNECTION_STRING'] || '',
        'db.runCommand({ ping: 1 })'
      );

      const baseResponse = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      };

      return {
        ...baseResponse,
        data: result,
      };

      if (result.isOk()) {
        return {
          ...baseResponse,
          database: {
            status: 'connected',
            ...result.value,
          },
        };
      }

      return {
        ...baseResponse,
        database: {
          status: 'disconnected',
          error: result.error.message,
        },
      };
    }
  );
};

export default healthRoutes;
