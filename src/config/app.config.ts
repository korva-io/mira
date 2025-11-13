/**
 * Centralized application configuration with environment validation
 */

import { LogLevel } from '../infrastructure/logging/structured-logger';
import { ServiceConfig, CacheConfig } from '../domain/types/query.types';

export interface DatabaseConfig {
  readonly maxConnections: number;
  readonly connectionTimeout: number;
  readonly queryTimeout: number;
}

export interface AiServiceConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly timeout: number;
}

export interface AppConfig {
  readonly service: ServiceConfig;
  readonly database: DatabaseConfig;
  readonly ai: AiServiceConfig;
  readonly redis: {
    readonly url: string;
    readonly tls: boolean;
    readonly rejectUnauthorized: boolean;
  };
}

/**
 * Environment variable validation and parsing
 */
class ConfigValidator {
  static getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  static getOptionalEnv(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
  }

  static getNumberEnv(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`Environment variable ${key} must be a valid number`);
    }
    return parsed;
  }

  static getBooleanEnv(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (!value) return defaultValue;
    
    return value.toLowerCase() === 'true';
  }

  static getLogLevel(): LogLevel {
    const level = process.env['LOG_LEVEL']?.toLowerCase() as LogLevel;
    const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    
    if (level && validLevels.includes(level)) {
      return level;
    }
    
    return 'info';
  }
}

/**
 * Application configuration constants
 */
export const APP_CONSTANTS = {
  CACHE: {
    DEFAULT_TTL: 3600, // 1 hour
    KEY_PREFIX: 'mira:query:',
    MAX_KEY_LENGTH: 250,
  },
  QUERY: {
    MAX_LENGTH: 10000,
    DEFAULT_TIMEOUT: 30000, // 30 seconds
    MAX_RESULTS: 10000,
  },
  AI: {
    DEFAULT_TEMPERATURE: 0.0,
    DEFAULT_MAX_TOKENS: 4096,
    DEFAULT_TIMEOUT: 60000, // 60 seconds
  },
  DATABASE: {
    MAX_CONNECTIONS: 10,
    CONNECTION_TIMEOUT: 10000, // 10 seconds
    QUERY_TIMEOUT: 30000, // 30 seconds
  },
} as const;

/**
 * Load and validate application configuration
 */
export function loadAppConfig(): AppConfig {
  try {
    const cacheConfig: CacheConfig = {
      ttl: ConfigValidator.getNumberEnv('CACHE_TTL', APP_CONSTANTS.CACHE.DEFAULT_TTL),
      keyPrefix: ConfigValidator.getOptionalEnv('CACHE_KEY_PREFIX', APP_CONSTANTS.CACHE.KEY_PREFIX),
      enabled: ConfigValidator.getBooleanEnv('CACHE_ENABLED', true),
    };

    const serviceConfig: ServiceConfig = {
      cache: cacheConfig,
      maxQueryLength: ConfigValidator.getNumberEnv('MAX_QUERY_LENGTH', APP_CONSTANTS.QUERY.MAX_LENGTH),
      enableValidation: ConfigValidator.getBooleanEnv('ENABLE_VALIDATION', true),
      logLevel: ConfigValidator.getLogLevel(),
    };

    const databaseConfig: DatabaseConfig = {
      maxConnections: ConfigValidator.getNumberEnv('DB_MAX_CONNECTIONS', APP_CONSTANTS.DATABASE.MAX_CONNECTIONS),
      connectionTimeout: ConfigValidator.getNumberEnv('DB_CONNECTION_TIMEOUT', APP_CONSTANTS.DATABASE.CONNECTION_TIMEOUT),
      queryTimeout: ConfigValidator.getNumberEnv('DB_QUERY_TIMEOUT', APP_CONSTANTS.DATABASE.QUERY_TIMEOUT),
    };

    const aiConfig: AiServiceConfig = {
      apiKey: ConfigValidator.getRequiredEnv('GROK_API_KEY'),
      baseUrl: ConfigValidator.getOptionalEnv('GROK_API_URL', 'https://api.x.ai/grok/v1'),
      model: ConfigValidator.getOptionalEnv('GROK_MODEL', 'grok-3-mini'),
      temperature: ConfigValidator.getNumberEnv('AI_TEMPERATURE', APP_CONSTANTS.AI.DEFAULT_TEMPERATURE),
      maxTokens: ConfigValidator.getNumberEnv('AI_MAX_TOKENS', APP_CONSTANTS.AI.DEFAULT_MAX_TOKENS),
      timeout: ConfigValidator.getNumberEnv('AI_TIMEOUT', APP_CONSTANTS.AI.DEFAULT_TIMEOUT),
    };

    const redisConfig = {
      url: ConfigValidator.getOptionalEnv('REDIS_URL', 'redis://localhost:6379'),
      tls: ConfigValidator.getBooleanEnv('REDIS_TLS', true),
      rejectUnauthorized: ConfigValidator.getBooleanEnv('REDIS_REJECT_UNAUTHORIZED', false),
    };

    return {
      service: serviceConfig,
      database: databaseConfig,
      ai: aiConfig,
      redis: redisConfig,
    };
  } catch (error) {
    throw new Error(`Configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Global configuration instance
 */
export const appConfig = loadAppConfig();
