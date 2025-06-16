import { QueryResultType } from '../domain/types';

export interface DatabaseRepository {
  executeQuery(query: string): Promise<QueryResultType>;
}

export interface CacheService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
}

export interface AiService {
  translateToQuery(nlQuery: string, dbType: string): Promise<QueryResultType>;
}

export interface Logger {
  logQuery(input: {
    userId: string;
    nlQuery: string;
    dbType: string;
    result: QueryResultType;
  }): Promise<void>;
}
