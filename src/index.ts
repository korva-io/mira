import Fastify from 'fastify';
import fastifyEnv from '@fastify/env';
import healthRoutes from './api/routes/health';
import swaggerPlugin from './api/swagger';
import { envSchema, getConfig } from './config';

const fastify = Fastify({
  logger: {
    level: 'debug',
    transport: {
      target: 'pino-pretty',
    },
  },
});

async function start(): Promise<void> {
  try {
    console.log('Starting server...');
    console.log('Environment schema:', JSON.stringify(envSchema, null, 2));

    await fastify.register(fastifyEnv, {
      schema: envSchema,
      dotenv: true,
    });

    const { port, host } = getConfig();
    console.log('Environment loaded successfully');
    console.log('Server will start on:', `http://${host}:${port}`);

    // Register plugins
    await fastify.register(swaggerPlugin);

    // Register routes
    await fastify.register(healthRoutes);

    await fastify.listen({ port, host });
  } catch (err) {
    console.error('Error starting server:', err);
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
