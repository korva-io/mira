import Fastify from 'fastify';
import fastifyEnv from '@fastify/env';
import healthRoutes from './api/routes/health';
import queryRoutes from './api/routes/query';
import swaggerPlugin from './api/swagger';
import { envSchema, getConfig } from './config';

const server = Fastify({
  logger: true,
});

const start = async () => {
  try {
    // Load environment variables
    await server.register(fastifyEnv, {
      schema: envSchema,
      dotenv: true,
    });

    const { port, host } = getConfig();
    console.log('Environment loaded successfully');
    console.log('Server will start on:', `http://${host}:${port}`);

    // Register plugins
    await server.register(swaggerPlugin);

    // Register routes
    await server.register(healthRoutes);
    await server.register(queryRoutes);

    await server.listen({ port, host });
    console.log(`Server listening on ${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
