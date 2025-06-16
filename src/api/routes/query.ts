import { FastifyPluginAsync } from 'fastify';
import {
  API_PREFIX,
  QueryInputSchema,
  QueryInput,
  queryInputJsonSchema,
  queryResponseSchema,
  errorResponseSchema,
} from '../schemas';
import { QueryService } from '../../application/queryService';
import { PostgresRepository } from '../../infrastructure/database/postgres';
import { MongoRepository } from '../../infrastructure/database/mongodb';
import { RedisCache } from '../../infrastructure/cache/redis';
import { GrokApi } from '../../infrastructure/grokApi';
import { MongoLogger } from '../../infrastructure/logging/mongoLogger';

const queryRoutes: FastifyPluginAsync = async (fastify) => {
  const queryService = new QueryService(
    new PostgresRepository(),
    new MongoRepository(),
    new RedisCache(),
    new GrokApi(),
    new MongoLogger()
  );

  fastify.post<{ Body: QueryInput }>(
    `${API_PREFIX}/query`,
    {
      schema: {
        tags: ['query'],
        summary: 'Execute a natural language query',
        description: 'Translates natural language to SQL/MongoDB query and executes it',
        body: queryInputJsonSchema,
        response: {
          200: queryResponseSchema,
          400: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const parseResult = QueryInputSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: parseResult.error.message });
      }

      const result = await queryService.executeQuery(parseResult.data);
      if (result.isErr()) {
        return reply.status(500).send({ error: result.error.message });
      }

      return { data: result.value.data };
    }
  );
};

export default queryRoutes;
