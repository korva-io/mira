import { Result } from 'neverthrow';

/**
 * Supported database types
 */
export type DatabaseType = 'postgres' | 'mongodb';

/**
 * Query execution configuration
 */
export interface QueryConfiguration {
  // Client SDK compatible options
  readonly outputKeyFormat?: 'camelCase' | 'snake_case' | 'PascalCase' | 'kebab-case' | 'original';
  readonly maxResults?: number;
  readonly timeout?: number;
  
  // Backend-specific advanced options
  readonly sort?: {
    readonly field: string;
    readonly order: 'asc' | 'desc';
  };
  readonly filters?: ReadonlyArray<{
    readonly field: string;
    readonly operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'like';
    readonly value: string | number | boolean | ReadonlyArray<string | number>;
  }>;
  readonly returnType?: 'array' | 'object' | 'scalar';
  readonly presentation?: 'table' | 'list' | 'single' | 'empty';
  readonly groupBy?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Query input with strict typing
 */
export interface QueryInput {
  readonly connectionString: string;
  readonly nlQuery: string;
  readonly userId: string;
  readonly configuration?: QueryConfiguration;
}

/**
 * Query execution metadata
 */
export interface QueryMetadata {
  readonly executionTime: number;
  readonly queryType: DatabaseType;
  readonly timestamp: string;
  readonly cacheHit?: boolean;
  readonly model?: string;
  // Données de pagination
  readonly totalCount?: number;
  readonly page?: number;
  readonly pageSize?: number;
  readonly hasNextPage?: boolean;
  readonly hasPreviousPage?: boolean;
  // Informations sur la requête
  readonly sqlQuery?: string;
  readonly queryComplexity?: 'low' | 'medium' | 'high';
  readonly dataFreshness?: string;
  // Autres métadonnées API utiles
  readonly resultType?: 'list' | 'single' | 'count' | 'aggregation';
  readonly affectedRows?: number;
  readonly warnings?: string[];
}

/**
 * Mira Notes - Informations contextuelles et commentaires
 */
export interface MiraNotes {
  readonly comment: string;
  readonly explanation?: string;
  readonly suggestions?: string[];
  readonly queryIntent?: string;
  readonly dataInsights?: string;
  readonly performance?: {
    readonly optimizationTips?: string[];
    readonly indexSuggestions?: string[];
  };
  readonly context?: {
    readonly userQuery: string;
    readonly interpretedAs?: string;
    readonly assumptions?: string[];
  };
}

/**
 * Query result structure
 */
export interface QueryResult {
  // Data peut être un tableau (liste) ou une valeur scalaire (count, etc.)
  readonly data: ReadonlyArray<Record<string, unknown>> | Record<string, unknown> | number | string | boolean;
  readonly metadata: QueryMetadata;
  readonly ___miraNotes: MiraNotes;
}

/**
 * Standardized error structure
 */
export interface QueryError {
  readonly message: string;
  readonly code: string;
  readonly details?: unknown;
  readonly timestamp?: string;
  readonly userId?: string;
}

/**
 * Query result type alias
 */
export type QueryResultType = Result<QueryResult, QueryError>;

/**
 * Cache configuration
 */
export interface CacheConfig {
  readonly ttl: number;
  readonly keyPrefix: string;
  readonly enabled: boolean;
}

/**
 * Service configuration
 */
export interface ServiceConfig {
  readonly cache: CacheConfig;
  readonly maxQueryLength: number;
  readonly enableValidation: boolean;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
}
