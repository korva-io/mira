import { err, ok, Result } from 'neverthrow';
import { QueryInput } from '../api/schemas';
import { QueryError, QueryResult, QueryResultType } from '../domain/types';
import { AiService, CacheService, DatabaseRepository, Logger } from '../infrastructure/interfaces';

export class QueryService {
  constructor(
    private readonly postgresRepo: DatabaseRepository,
    private readonly mongoRepo: DatabaseRepository,
    private readonly cache: CacheService,
    private readonly ai: AiService,
    private readonly logger: Logger
  ) {}

  async executeQuery(input: QueryInput): Promise<QueryResultType> {
    try {
      // Check cache first
      const cacheKey = `${input.userId}:${input.nlQuery}:${input.dbType}`;
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        return ok(JSON.parse(cachedResult) as QueryResult);
      }

      // Translate natural language to query
      const translationResult = await this.ai.translateToQuery(input.nlQuery, input.dbType);
      if (translationResult.isErr()) {
        return err(translationResult.error);
      }

      // Execute query
      const repo = input.dbType === 'postgres' ? this.postgresRepo : this.mongoRepo;
      const result = await repo.executeQuery(translationResult.value.data[0].query as string);

      // Cache successful results
      if (result.isOk()) {
        await this.cache.set(cacheKey, JSON.stringify(result.value), 3600); // Cache for 1 hour
      }

      // // Log the query
      // await this.logger.logQuery({
      //   userId: input.userId,
      //   nlQuery: input.nlQuery,
      //   dbType: input.dbType,
      //   result,
      // });

      return result;
    } catch (error) {
      return err({
        message: 'Failed to execute query',
        code: 'QUERY_EXECUTION_ERROR',
        details: error,
      } as QueryError);
    }
  }
}
