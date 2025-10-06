import { Pool } from 'pg';
import { Result, err, ok } from 'neverthrow';
import { DatabaseRepository } from '../interfaces';
import { QueryError, QueryResult } from '../../domain/types';

export class PostgresRepository implements DatabaseRepository {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.POSTGRES_CONNECTION_STRING,
    });
  }

  async executeQuery(query: string): Promise<Result<QueryResult, QueryError>> {
    try {
      const result = await this.pool.query(query);
      return ok({
        data: result.rows,
        metadata: {
          rowCount: result.rowCount,
          command: result.command,
        },
      });
    } catch (error) {
      return err({
        message: ('Failed to execute PostgreSQL query '+ error.message ),
        code: 'POSTGRES_ERROR',
        details: error,
      });
    }
  }
}
