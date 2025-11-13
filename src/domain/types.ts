import { Result } from 'neverthrow';

export type DbType = 'postgres' | 'mongodb';

export interface QueryResult {
  data: Record<string, unknown>[];
  comment?: string;  // Make it optional
  metadata: {
    executionTime: number;
    queryType: string;
    timestamp: string;
  };
}

export interface QueryError {
  message: string;
  code: string;
  details?: unknown;
}

export type QueryResultType = Result<QueryResult, QueryError>;
