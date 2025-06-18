import { Result } from 'neverthrow';
import { QueryError, QueryResult } from '../domain/types';

export interface DatabaseRepository {
  executeQuery(
    connectionString: string,
    query: string,
    params?: unknown[]
  ): Promise<Result<QueryResult, QueryError>>;
}

export interface CacheService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface AiService {
  translateToQuery(nlQuery: string, dbType: string): Promise<Result<QueryResult, QueryError>>;
}

export interface Logger {
  logQuery(params: {
    userId: string;
    nlQuery: string;
    dbType: string;
    result: Result<unknown, unknown>;
  }): Promise<void>;
}
