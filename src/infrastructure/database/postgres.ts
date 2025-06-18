import { Pool } from 'pg';
import { Result, err, ok } from 'neverthrow';
import { DatabaseRepository } from '../interfaces';
import { QueryError, QueryResult } from '../../domain/types';

export class PostgresRepository implements DatabaseRepository {
  async executeQuery(
    connectionString: string,
    query: string,
    params: unknown[] = []
  ): Promise<Result<QueryResult, QueryError>> {
    const pool = new Pool({ connectionString });
    const startTime = Date.now();

    try {
      const result = await pool.query(query, params);
      const executionTime = Date.now() - startTime;

      return ok({
        data: result.rows,
        metadata: {
          executionTime,
          queryType: 'postgres',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      return err({
        message: 'Failed to execute PostgreSQL query',
        code: 'POSTGRES_ERROR',
        details: error,
      });
    } finally {
      await pool.end();
    }
  }
}
