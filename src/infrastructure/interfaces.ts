import { Result } from 'neverthrow';
import { QueryError, QueryResultType } from '../domain/types';

export interface DatabaseRepository {
  executeQuery(
    query: string,
    dbType: string,
    connectionString: string
  ): Promise<Result<any[], QueryError>>;
}

export interface CacheService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
}

export interface AiService {
  translateToQuery(nlQuery: string, dbType: string, schema?: string): Promise<QueryResultType>;
  analyzeData(data: string, question: string, configuration?: Record<string, unknown>): Promise<Result<string, QueryError>>;
}

export interface Logger {
  logQuery(input: {
    userId: string;
    nlQuery: string;
    dbType: string;
    result: QueryResultType;
  }): Promise<void>;
}
