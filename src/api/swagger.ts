import { FastifyPluginAsync } from 'fastify';
import { API_PREFIX } from './schemas';
import { getConfig } from '../config';
import fp from 'fastify-plugin';
const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  const { port, host } = getConfig();

  await fastify.register(import('@fastify/swagger'), {
    openapi: {
      info: {
        title: 'Mira API',
        description: 'AI-powered database query interpreter API',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://${host}:${port}${API_PREFIX}`,
          description: 'Development server',
        },
      ],
      tags: [
        {
          name: 'health',
          description: 'Health check endpoints',
        },
        {
          name: 'query',
          description: 'Database query endpoints',
        },
      ],
    },
  });

  await fastify.register(import('@fastify/swagger-ui'), {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
  });
};

export default fp(swaggerPlugin);
