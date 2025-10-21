import { err, ok, Result } from 'neverthrow';
import { QueryInput } from '../api/schemas';
import { QueryError, QueryResult, QueryResultType } from '../domain/types';
import { AiService, CacheService, DatabaseRepository, Logger } from '../infrastructure/interfaces';
import { SchemaExtractor } from '../infrastructure/database/schemaExtractor';

export class QueryService {
  private readonly schemaExtractor: SchemaExtractor;

  constructor(
    private readonly postgresRepo: DatabaseRepository,
    private readonly mongoRepo: DatabaseRepository,
    private readonly cache: CacheService,
    private readonly ai: AiService,
    private readonly logger: Logger
  ) {
    this.schemaExtractor = new SchemaExtractor();
  }

  async executeQuery(input: QueryInput): Promise<QueryResultType> {
    try {
      // Check cache first
      const cacheKey = `${input.userId}:${input.nlQuery}:${input.dbType}`;
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        return ok(JSON.parse(cachedResult) as QueryResult);
      }

      // Extract database schema first
      const schemaResult = await this.schemaExtractor.extractSchema(
        input.connectionString,
        input.dbType
      );
      if (schemaResult.isErr()) {
        return err(schemaResult.error);
      }

      // Translate natural language to query using the schema
      const translationResult = await this.ai.translateToQuery(
        input.nlQuery, 
        input.dbType,
        schemaResult.value
      );
      if (translationResult.isErr()) {
        return err(translationResult.error);
      }

      // Execute query
      const repo = input.dbType === 'postgres' ? this.postgresRepo : this.mongoRepo;
      const queryToExecute = translationResult.value.data[0]?.['query'] as string;
      if (!queryToExecute) {
        return err({
          message: 'No query generated from translation',
          code: 'QUERY_GENERATION_ERROR',
        });
      }
      const executionResult = await repo.executeQuery(queryToExecute, input.dbType, input.connectionString);
      
      if (executionResult.isErr()) {
        return err(executionResult.error);
      }

      // Wrap the result in the expected QueryResult format
      const result: QueryResult = {
        data: executionResult.value,
        metadata: {
          executionTime: 0,
          queryType: input.dbType,
          timestamp: new Date().toISOString(),
        },
      };

      // Cache successful results
      await this.cache.set(cacheKey, JSON.stringify(result), 3600); // Cache for 1 hour

      // // Log the query
      // await this.logger.logQuery({
      //   userId: input.userId,
      //   nlQuery: input.nlQuery,
      //   dbType: input.dbType,
      //   result: ok(result),
      // });

      return ok(result);
    } catch (error) {
      return err({
        message: 'Failed to execute query',
        code: 'QUERY_EXECUTION_ERROR',
        details: error,
      } as QueryError);
    }
  }

  async generateSchemaInsights(
    failedQueries: string[],
    connectionString: string
  ): Promise<Result<string, QueryError>> {
    try {
      // Extract the current schema
      const schemaResult = await this.schemaExtractor.extractSchema(
        connectionString,
        'postgres' // Default to postgres, could be enhanced to detect from connection string
      );
      if (schemaResult.isErr()) {
        return err({
          code: 'SCHEMA_EXTRACTION_FAILED',
          message: schemaResult.error.message,
        });
      }

      // Generate insights using AI
      const prompt = `Given the following database schema:\n${JSON.stringify(schemaResult.value, null, 2)}\n\nAnd these failed queries:\n${failedQueries.join('\n')}\n\nProvide insights on how to improve the schema to better support these queries.`;
      
      const insightsResult = await this.ai.translateToQuery(prompt, 'postgres', schemaResult.value);
      if (insightsResult.isErr()) {
        return err({
          code: 'INSIGHTS_GENERATION_FAILED',
          message: insightsResult.error.message,
        });
      }

      return ok(JSON.stringify(insightsResult.value));
    } catch (error) {
      return err({
        code: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  }
}
