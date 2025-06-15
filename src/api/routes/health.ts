import { FastifyPluginAsync } from 'fastify';
import { API_PREFIX, healthResponseSchema } from '../schemas';

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
};

export default healthRoutes;
