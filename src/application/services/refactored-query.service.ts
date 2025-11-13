/**
 * Refactored QueryService following SOLID principles and senior development practices
 */

import { Result, err, ok } from 'neverthrow';
import { 
  QueryInput, 
  QueryResult, 
  QueryResultType, 
  QueryError, 
  DatabaseType,
  ServiceConfig 
} from '../../domain/types/query.types';
import { QueryValidator } from '../../domain/validation/query.validator';
import { StructuredLogger } from '../../infrastructure/logging/structured-logger';
import { AiService, CacheService, DatabaseRepository } from '../../infrastructure/interfaces';
import { SchemaExtractor } from '../../infrastructure/database/schemaExtractor';

/**
 * Query execution context for tracking and logging
 */
interface QueryExecutionContext {
  readonly requestId: string;
  readonly userId: string;
  readonly operation: string;
  readonly startTime: number;
  readonly metadata: Record<string, unknown>;
}


/**
 * Pipeline execution state
 */
interface PipelineState {
  schema?: string;
  translatedQuery?: string;
  executionResult?: unknown[];
  analysisResult?: QueryResult;
}

/**
 * Refactored QueryService with separation of concerns
 */
export class RefactoredQueryService {
  private readonly logger: StructuredLogger;
  private readonly schemaExtractor: SchemaExtractor;

  constructor(
    private readonly postgresRepo: DatabaseRepository,
    private readonly mongoRepo: DatabaseRepository,
    private readonly cache: CacheService,
    private readonly ai: AiService,
    private readonly config: ServiceConfig,
    logger: StructuredLogger
  ) {
    this.logger = logger;
    this.schemaExtractor = new SchemaExtractor();
  }

  /**
   * Main entry point for query execution
   */
  async executeQuery(input: QueryInput): Promise<QueryResultType> {
    const requestId = this.generateRequestId();
    const context: QueryExecutionContext = {
      requestId,
      userId: input.userId,
      operation: 'executeQuery',
      startTime: Date.now(),
      metadata: {
        dbType: input.dbType,
        queryLength: input.nlQuery.length,
        hasConfiguration: !!input.configuration,
      },
    };

    this.logger.info('Starting query execution', {
      requestId: context.requestId,
      userId: context.userId,
      operation: context.operation,
    });

    try {
      // Step 1: Validate input
      const validationResult = await this.validateInput(input, context);
      if (validationResult.isErr()) {
        return err(validationResult.error);
      }

      // Step 2: Check cache
      const cacheResult = await this.checkCache(input, context);
      if (cacheResult.isOk()) {
        return cacheResult;
      }

      // Step 3: Execute query pipeline
      const result = await this.executeQueryPipeline(input, context);

      // Step 4: Cache successful results
      if (result.isOk() && this.config.cache.enabled) {
        await this.cacheResult(input, result.value, context);
      }

      this.logExecutionComplete(context, result);
      return result;

    } catch (error) {
      const queryError: QueryError = {
        message: 'Unexpected error during query execution',
        code: 'UNEXPECTED_ERROR',
        details: error,
        timestamp: new Date().toISOString(),
        userId: input.userId,
      };

      this.logger.error('Query execution failed', error as Error, {
        requestId: context.requestId,
        userId: context.userId,
        operation: context.operation,
        duration: Date.now() - context.startTime,
      });

      return err(queryError);
    }
  }

  /**
   * Generate schema insights for failed queries
   */
  async generateSchemaInsights(
    failedQueries: string[],
    connectionString: string
  ): Promise<Result<string, QueryError>> {
    const requestId = this.generateRequestId();
    const context: QueryExecutionContext = {
      requestId,
      userId: 'system',
      operation: 'generateSchemaInsights',
      startTime: Date.now(),
      metadata: {
        failedQueriesCount: failedQueries.length,
      },
    };

    this.logger.info('Starting schema insights generation', {
      requestId: context.requestId,
      operation: context.operation,
      metadata: { failedQueriesCount: failedQueries.length },
    });

    try {
      // Validate inputs
      if (!Array.isArray(failedQueries) || failedQueries.length === 0) {
        return err({
          message: 'At least one failed query is required',
          code: 'INVALID_INPUT',
          timestamp: new Date().toISOString(),
        });
      }

      if (!connectionString || typeof connectionString !== 'string') {
        return err({
          message: 'Valid connection string is required',
          code: 'INVALID_INPUT',
          timestamp: new Date().toISOString(),
        });
      }

      // Extract schema
      const dbType = this.detectDatabaseType(connectionString);
      const schemaResult = await this.schemaExtractor.extractSchema(connectionString, dbType);
      
      if (schemaResult.isErr()) {
        return err({
          message: 'Failed to extract database schema',
          code: 'SCHEMA_EXTRACTION_FAILED',
          details: schemaResult.error,
          timestamp: new Date().toISOString(),
        });
      }

      // Generate insights using AI
      const prompt = this.buildInsightsPrompt(failedQueries, schemaResult.value);
      const insightsResult = await this.ai.translateToQuery(prompt, dbType, schemaResult.value);
      
      if (insightsResult.isErr()) {
        return err({
          message: 'Failed to generate insights',
          code: 'INSIGHTS_GENERATION_FAILED',
          details: insightsResult.error,
          timestamp: new Date().toISOString(),
        });
      }

      this.logger.info('Schema insights generated successfully', {
        requestId: context.requestId,
        operation: context.operation,
        duration: Date.now() - context.startTime,
      });

      return ok(JSON.stringify(insightsResult.value));

    } catch (error) {
      this.logger.error('Schema insights generation failed', error as Error, {
        requestId: context.requestId,
        operation: context.operation,
        duration: Date.now() - context.startTime,
      });

      return err({
        message: 'Unexpected error during schema insights generation',
        code: 'UNEXPECTED_ERROR',
        details: error,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Validate query input
   */
  private async validateInput(
    input: QueryInput,
    context: QueryExecutionContext
  ): Promise<Result<QueryInput, QueryError>> {
    const validationResult = QueryValidator.validateQueryInput(input);
    
    if (validationResult.isErr()) {
      this.logger.warn('Input validation failed', {
        requestId: context.requestId,
        userId: context.userId,
        metadata: { errors: validationResult.error.details },
      });
    }

    return validationResult;
  }

  /**
   * Check cache for existing results
   */
  private async checkCache(
    input: QueryInput,
    context: QueryExecutionContext
  ): Promise<QueryResultType> {
    if (!this.config.cache.enabled) {
      return err({
        message: 'Cache disabled',
        code: 'CACHE_DISABLED',
      });
    }

    try {
      const cacheKey = this.generateCacheKey(input);
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.logger.debug('Cache hit', {
          requestId: context.requestId,
          userId: context.userId,
          metadata: { cacheKey },
        });

        const result = JSON.parse(cached) as QueryResult;
        return ok({
          ...result,
          metadata: {
            ...result.metadata,
            cacheHit: true,
          },
        });
      }

      this.logger.debug('Cache miss', {
        requestId: context.requestId,
        userId: context.userId,
        metadata: { cacheKey },
      });

      return err({
        message: 'Cache miss',
        code: 'CACHE_MISS',
      });

    } catch (error) {
      this.logger.warn('Cache check failed', {
        requestId: context.requestId,
        userId: context.userId,
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
      });

      return err({
        message: 'Cache check failed',
        code: 'CACHE_ERROR',
        details: error,
      });
    }
  }

  /**
   * Execute query pipeline with proper state management
   */
  private async executeQueryPipeline(
    input: QueryInput,
    context: QueryExecutionContext
  ): Promise<QueryResultType> {
    const state: PipelineState = {};

    try {
      // Step 1: Extract schema
      this.logger.debug('Executing pipeline step: extractSchema', {
        requestId: context.requestId,
        userId: context.userId,
        metadata: { step: 'extractSchema' },
      });

      const schemaResult = await this.extractSchema(input, context);
      if (schemaResult.isErr()) {
        return err(schemaResult.error);
      }
      state.schema = schemaResult.value;

      // Step 2: Translate query
      this.logger.debug('Executing pipeline step: translateQuery', {
        requestId: context.requestId,
        userId: context.userId,
        metadata: { step: 'translateQuery' },
      });

      const queryResult = await this.translateQuery(input, context);
      if (queryResult.isErr()) {
        return err(queryResult.error);
      }
      state.translatedQuery = queryResult.value;

      // Step 3: Execute database query
      this.logger.debug('Executing pipeline step: executeQuery', {
        requestId: context.requestId,
        userId: context.userId,
        metadata: { step: 'executeQuery' },
      });

      const executionResult = await this.executeDatabaseQuery(input, context);
      if (executionResult.isErr()) {
        return err(executionResult.error);
      }
      state.executionResult = executionResult.value;

      // Step 4: Analyze results
      this.logger.debug('Executing pipeline step: analyzeResults', {
        requestId: context.requestId,
        userId: context.userId,
        metadata: { step: 'analyzeResults' },
      });

      const analysisResult = await this.analyzeResults(input, context);
      if (analysisResult.isErr()) {
        return err(analysisResult.error);
      }

      return ok(analysisResult.value);
    } catch (error) {
      this.logger.error('Pipeline execution failed', error as Error, {
        requestId: context.requestId,
        userId: context.userId,
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
      });

      return err({
        message: 'Pipeline execution failed',
        code: 'PIPELINE_ERROR',
        details: error,
        timestamp: new Date().toISOString(),
        userId: input.userId,
      });
    }
  }


  /**
   * Extract database schema
   */
  private async extractSchema(
    input: QueryInput,
    context: QueryExecutionContext
  ): Promise<Result<string, QueryError>> {
    try {
      const result = await this.schemaExtractor.extractSchema(
        input.connectionString,
        input.dbType
      );

      if (result.isErr()) {
        return err({
          message: 'Failed to extract database schema',
          code: 'SCHEMA_EXTRACTION_FAILED',
          details: result.error,
          timestamp: new Date().toISOString(),
          userId: input.userId,
        });
      }

      return ok(result.value);
    } catch (error) {
      return err({
        message: 'Unexpected error during schema extraction',
        code: 'UNEXPECTED_ERROR',
        details: error,
        timestamp: new Date().toISOString(),
        userId: input.userId,
      });
    }
  }

  /**
   * Translate natural language to query
   */
  private async translateQuery(
    input: QueryInput,
    context: QueryExecutionContext
  ): Promise<Result<string, QueryError>> {
    // Implementation would go here
    // This is a placeholder for the actual translation logic
    return err({
      message: 'Translation not implemented',
      code: 'NOT_IMPLEMENTED',
    });
  }

  /**
   * Execute database query
   */
  private async executeDatabaseQuery(
    input: QueryInput,
    context: QueryExecutionContext
  ): Promise<Result<unknown[], QueryError>> {
    // Implementation would go here
    // This is a placeholder for the actual database execution logic
    return err({
      message: 'Database execution not implemented',
      code: 'NOT_IMPLEMENTED',
    });
  }

  /**
   * Analyze query results
   */
  private async analyzeResults(
    input: QueryInput,
    context: QueryExecutionContext
  ): Promise<Result<QueryResult, QueryError>> {
    try {
      // Get execution results from pipeline state (placeholder)
      const rawResults: unknown[] = []; // This would come from the actual execution
      
      // Apply configuration options
      let processedResults = rawResults;
      
      // Apply maxResults limit
      if (input.configuration?.maxResults) {
        processedResults = processedResults.slice(0, input.configuration.maxResults);
        
        this.logger.debug('Applied maxResults limit', {
          requestId: context.requestId,
          userId: context.userId,
          metadata: { 
            originalCount: rawResults.length,
            limitedCount: processedResults.length,
            maxResults: input.configuration.maxResults,
          },
        });
      }
      
      // Apply key format transformation
      if (input.configuration?.outputKeyFormat && input.configuration.outputKeyFormat !== 'original') {
        processedResults = this.transformKeyFormat(
          processedResults,
          input.configuration.outputKeyFormat
        );
        
        this.logger.debug('Applied key format transformation', {
          requestId: context.requestId,
          userId: context.userId,
          metadata: { outputKeyFormat: input.configuration.outputKeyFormat },
        });
      }
      
      // Build result
      const result: QueryResult = {
        data: processedResults as ReadonlyArray<Record<string, unknown>>,
        metadata: {
          executionTime: Date.now() - context.startTime,
          queryType: input.dbType,
          timestamp: new Date().toISOString(),
        },
        meta: {
          configuration: input.configuration,
          data_freshness: new Date().toISOString(),
        },
      };
      
      return ok(result);
    } catch (error) {
      return err({
        message: 'Failed to analyze results',
        code: 'ANALYSIS_ERROR',
        details: error,
        timestamp: new Date().toISOString(),
        userId: input.userId,
      });
    }
  }

  /**
   * Transform object keys according to the specified format
   */
  private transformKeyFormat(
    data: unknown[],
    format: 'camelCase' | 'snake_case' | 'PascalCase' | 'kebab-case' | 'original'
  ): unknown[] {
    if (format === 'original') return data;
    
    return data.map(item => {
      if (typeof item !== 'object' || item === null) return item;
      
      const transformed: Record<string, unknown> = {};
      const obj = item as Record<string, unknown>;
      
      for (const [key, value] of Object.entries(obj)) {
        const newKey = this.convertKeyFormat(key, format);
        transformed[newKey] = value;
      }
      
      return transformed;
    });
  }

  /**
   * Convert a single key to the specified format
   */
  private convertKeyFormat(
    key: string,
    format: 'camelCase' | 'snake_case' | 'PascalCase' | 'kebab-case'
  ): string {
    switch (format) {
      case 'camelCase':
        return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      case 'snake_case':
        return key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      case 'PascalCase':
        return key.charAt(0).toUpperCase() + 
               key.slice(1).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      case 'kebab-case':
        return key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
                  .replace(/_/g, '-');
      default:
        return key;
    }
  }

  /**
   * Cache query result
   */
  private async cacheResult(
    input: QueryInput,
    result: QueryResult,
    context: QueryExecutionContext
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(input);
      await this.cache.set(
        cacheKey,
        JSON.stringify(result),
        this.config.cache.ttl
      );

      this.logger.debug('Result cached successfully', {
        requestId: context.requestId,
        userId: context.userId,
        metadata: { 
          cacheKey,
          ttl: this.config.cache.ttl,
        },
      });
    } catch (error) {
      this.logger.warn('Failed to cache result', {
        requestId: context.requestId,
        userId: context.userId,
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
    }
  }

  /**
   * Generate cache key for query
   */
  private generateCacheKey(input: QueryInput): string {
    const keyParts = [
      this.config.cache.keyPrefix,
      input.userId,
      input.dbType,
      Buffer.from(input.nlQuery).toString('base64').slice(0, 50),
    ];
    
    if (input.configuration) {
      keyParts.push(Buffer.from(JSON.stringify(input.configuration)).toString('base64').slice(0, 20));
    }

    return keyParts.join(':');
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Detect database type from connection string
   */
  private detectDatabaseType(connectionString: string): DatabaseType {
    if (connectionString.includes('mongodb')) {
      return 'mongodb';
    }
    return 'postgres'; // Default to postgres
  }

  /**
   * Build insights prompt for AI
   */
  private buildInsightsPrompt(failedQueries: string[], schema: string): string {
    return `Given the following database schema:\n${JSON.stringify(schema, null, 2)}\n\nAnd these failed queries:\n${failedQueries.join('\n')}\n\nProvide insights on how to improve the schema to better support these queries.`;
  }

  /**
   * Log execution completion
   */
  private logExecutionComplete(
    context: QueryExecutionContext,
    result: QueryResultType
  ): void {
    const duration = Date.now() - context.startTime;
    const baseContext = {
      requestId: context.requestId,
      userId: context.userId,
      operation: context.operation,
      metadata: {
        duration,
        success: result.isOk(),
      },
    };

    if (result.isOk()) {
      this.logger.info('Query execution completed successfully', baseContext);
    } else {
      this.logger.error('Query execution failed', undefined, {
        ...baseContext,
        metadata: {
          ...baseContext.metadata,
          errorCode: result.error.code,
          errorMessage: result.error.message,
        },
      });
    }
  }
}
