import { Result } from 'neverthrow';

export type DbType = 'postgres' | 'mongodb';

export type ResultType = 'list' | 'single' | 'count' | 'aggregation';

export interface QueryMetadata {
  executionTime: number;
  queryType: string;
  timestamp: string;
  resultType: ResultType;
  totalCount?: number;
  sqlQuery: string;
  queryComplexity: 'low' | 'medium' | 'high';
  dataFreshness: string;
}

export interface MiraNotes {
  comment: string;
  queryIntent: string;
  context: {
    userQuery: string;
    interpretedAs: string;
  };
  dataInsights: string;
  suggestions: string[];
}

export interface QueryResult {
  data: number | Record<string, unknown>[];
  comment?: string;  // Make it optional
  metadata: QueryMetadata;
  ___miraNotes?: MiraNotes;
}

export interface QueryError {
  message: string;
  code: string;
  details?: unknown;
}

export type QueryResultType = Result<QueryResult, QueryError>;
