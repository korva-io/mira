import { Pool } from 'pg';
import { Result, err, ok } from 'neverthrow';
import { DatabaseRepository } from '../interfaces';
import { QueryError } from '../../domain/types';

export class PostgresRepository implements DatabaseRepository {
  async executeQuery(
    query: string,
    _dbType: string,
    connectionString: string
  ): Promise<Result<any[], QueryError>> {
    let pool: Pool | null = null;
    try {
      // Create a new pool with the provided connection string
      pool = new Pool({
        connectionString,
      });

      const result = await pool.query(query);
      console.log("ok connected to database ", result)
      return ok(result.rows);

    } catch (error: any) {
      return err({
        message: `Failed to execute PostgreSQL query: ${error.message}`,
        code: 'POSTGRES_ERROR',
        details: error,
      });
    } finally {
      // Clean up the connection
      if (pool) {
        await pool.end();
      }
    }
  }
}
