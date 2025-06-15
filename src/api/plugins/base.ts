import { FastifyPluginAsync } from 'fastify';
import { API_PREFIX } from '../constants';

const basePlugin: FastifyPluginAsync = async (fastify) => {
  // Add common route prefix
  fastify.addHook('onRoute', (routeOptions) => {
    if (!routeOptions.url.startsWith(API_PREFIX)) {
      routeOptions.url = `${API_PREFIX}${routeOptions.url}`;
    }
  });

  // Add common response headers
  fastify.addHook('onSend', (request, reply, payload, done) => {
    void reply.header('X-API-Version', '1.0.0');
    done(null, payload);
  });
};

export default basePlugin;
