export enum ErrorCode {
  INVALID_QUERY_FORMAT = 'INVALID_QUERY_FORMAT',
  EMPTY_QUERY = 'EMPTY_QUERY',
  QUERY_GENERATION_ERROR = 'QUERY_GENERATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  QUERY_TOO_LONG = 'QUERY_TOO_LONG',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

export class QueryServiceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'QueryServiceError';
    Object.setPrototypeOf(this, QueryServiceError.prototype);
  }
}
