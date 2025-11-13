/**
 * Robust input validation with detailed error reporting
 */

import { Result, err, ok } from 'neverthrow';
import { QueryInput, QueryError, DatabaseType } from '../types/query.types';
import { APP_CONSTANTS } from '../../config/app.config';

export interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly code: string;
  readonly value?: unknown;
}

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: ReadonlyArray<ValidationError>;
}

/**
 * Comprehensive query input validator
 */
export class QueryValidator {
  private static readonly SUPPORTED_DB_TYPES: ReadonlyArray<DatabaseType> = ['postgres', 'mongodb'];
  private static readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  private static readonly CONNECTION_STRING_PATTERNS = {
    postgres: /^postgres(?:ql)?:\/\/(?:[^:]+(?::[^@]*)?@)?[^:\/]+(?::\d+)?\/[^?]+(?:\?.*)?$/i,
    mongodb: /^mongodb(?:\+srv)?:\/\/(?:[^:]+(?::[^@]*)?@)?[^:\/]+(?::\d+)?(?:\/[^?]*)?(?:\?.*)?$/i,
  };

  /**
   * Validate complete query input
   */
  static validateQueryInput(input: unknown): Result<QueryInput, QueryError> {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return err({
        message: 'Input must be a valid object',
        code: 'INVALID_INPUT_TYPE',
        timestamp: new Date().toISOString(),
      });
    }

    const inputObj = input as Record<string, unknown>;

    // Validate database type
    const dbTypeValidation = this.validateDatabaseType(inputObj['dbType']);
    if (!dbTypeValidation.isValid) {
      errors.push(...dbTypeValidation.errors);
    }

    // Validate connection string
    const connectionValidation = this.validateConnectionString(
      inputObj['connectionString'],
      inputObj['dbType'] as DatabaseType
    );
    if (!connectionValidation.isValid) {
      errors.push(...connectionValidation.errors);
    }

    // Validate natural language query
    const queryValidation = this.validateNaturalLanguageQuery(inputObj['nlQuery']);
    if (!queryValidation.isValid) {
      errors.push(...queryValidation.errors);
    }

    // Validate user ID
    const userIdValidation = this.validateUserId(inputObj['userId']);
    if (!userIdValidation.isValid) {
      errors.push(...userIdValidation.errors);
    }

    // Validate configuration if provided
    if (inputObj['configuration']) {
      const configResult = this.validateConfiguration(inputObj['configuration']);
      if (!configResult.isValid) {
        errors.push(...configResult.errors);
      }
    }

    if (errors.length > 0) {
      return err({
        message: `Validation failed: ${errors.map(e => e.message).join(', ')}`,
        code: 'VALIDATION_ERROR',
        details: errors,
        timestamp: new Date().toISOString(),
      });
    }

    return ok(inputObj as unknown as QueryInput);
  }

  /**
   * Validate database type
   */
  private static validateDatabaseType(dbType: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (!dbType) {
      errors.push({
        field: 'dbType',
        message: 'Database type is required',
        code: 'REQUIRED_FIELD',
        value: dbType,
      });
    } else if (typeof dbType !== 'string') {
      errors.push({
        field: 'dbType',
        message: 'Database type must be a string',
        code: 'INVALID_TYPE',
        value: dbType,
      });
    } else if (!this.SUPPORTED_DB_TYPES.includes(dbType as DatabaseType)) {
      errors.push({
        field: 'dbType',
        message: `Database type must be one of: ${this.SUPPORTED_DB_TYPES.join(', ')}`,
        code: 'INVALID_VALUE',
        value: dbType,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate connection string
   */
  private static validateConnectionString(
    connectionString: unknown,
    dbType: DatabaseType
  ): ValidationResult {
    const errors: ValidationError[] = [];

    if (!connectionString) {
      errors.push({
        field: 'connectionString',
        message: 'Connection string is required',
        code: 'REQUIRED_FIELD',
        value: connectionString,
      });
    } else if (typeof connectionString !== 'string') {
      errors.push({
        field: 'connectionString',
        message: 'Connection string must be a string',
        code: 'INVALID_TYPE',
        value: connectionString,
      });
    } else if (connectionString.length < 10) {
      errors.push({
        field: 'connectionString',
        message: 'Connection string is too short',
        code: 'INVALID_LENGTH',
        value: connectionString,
      });
    } else if (dbType && this.CONNECTION_STRING_PATTERNS[dbType]) {
      const pattern = this.CONNECTION_STRING_PATTERNS[dbType];
      if (!pattern.test(connectionString)) {
        errors.push({
          field: 'connectionString',
          message: `Invalid ${dbType} connection string format`,
          code: 'INVALID_FORMAT',
          value: connectionString,
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate natural language query
   */
  private static validateNaturalLanguageQuery(nlQuery: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (!nlQuery) {
      errors.push({
        field: 'nlQuery',
        message: 'Natural language query is required',
        code: 'REQUIRED_FIELD',
        value: nlQuery,
      });
    } else if (typeof nlQuery !== 'string') {
      errors.push({
        field: 'nlQuery',
        message: 'Natural language query must be a string',
        code: 'INVALID_TYPE',
        value: nlQuery,
      });
    } else if (nlQuery.trim().length < 5) {
      errors.push({
        field: 'nlQuery',
        message: 'Natural language query must be at least 5 characters long',
        code: 'INVALID_LENGTH',
        value: nlQuery,
      });
    } else if (nlQuery.length > APP_CONSTANTS.QUERY.MAX_LENGTH) {
      errors.push({
        field: 'nlQuery',
        message: `Natural language query exceeds maximum length of ${APP_CONSTANTS.QUERY.MAX_LENGTH} characters`,
        code: 'INVALID_LENGTH',
        value: nlQuery,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate user ID
   */
  private static validateUserId(userId: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (!userId) {
      errors.push({
        field: 'userId',
        message: 'User ID is required',
        code: 'REQUIRED_FIELD',
        value: userId,
      });
    } else if (typeof userId !== 'string') {
      errors.push({
        field: 'userId',
        message: 'User ID must be a string',
        code: 'INVALID_TYPE',
        value: userId,
      });
    } else if (!this.UUID_REGEX.test(userId)) {
      errors.push({
        field: 'userId',
        message: 'User ID must be a valid UUID',
        code: 'INVALID_FORMAT',
        value: userId,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate configuration object
   */
  private static validateConfiguration(configuration: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (configuration !== null && typeof configuration !== 'object') {
      errors.push({
        field: 'configuration',
        message: 'Configuration must be an object',
        code: 'INVALID_TYPE',
        value: configuration,
      });
      return { isValid: false, errors };
    }

    // Validate client SDK specific options
    const config = configuration as Record<string, unknown>;
    
    if (config && config['outputKeyFormat']) {
      const validFormats = ['camelCase', 'snake_case', 'PascalCase', 'kebab-case', 'original'];
      if (!validFormats.includes(config['outputKeyFormat'] as string)) {
        errors.push({
          field: 'configuration.outputKeyFormat',
          message: `Invalid outputKeyFormat. Must be one of: ${validFormats.join(', ')}`,
          code: 'INVALID_VALUE',
          value: config['outputKeyFormat'],
        });
      }
    }

    if (config && config['maxResults']) {
      const maxResults = config['maxResults'];
      if (typeof maxResults !== 'number' || maxResults < 1 || maxResults > 10000) {
        errors.push({
          field: 'configuration.maxResults',
          message: 'maxResults must be a number between 1 and 10000',
          code: 'INVALID_VALUE',
          value: maxResults,
        });
      }
    }

    if (config && config['timeout']) {
      const timeout = config['timeout'];
      if (typeof timeout !== 'number' || timeout < 1000 || timeout > 300000) {
        errors.push({
          field: 'configuration.timeout',
          message: 'timeout must be a number between 1000ms and 300000ms (5 minutes)',
          code: 'INVALID_VALUE',
          value: timeout,
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
