import { MongoClient } from 'mongodb';
import { Result, err, ok } from 'neverthrow';
import { DatabaseRepository } from '../interfaces';
import { QueryError, QueryResult } from '../../domain/types';

export class MongoRepository implements DatabaseRepository {
  private client: MongoClient;

  constructor() {
    this.client = new MongoClient(process.env.MONGODB_CONNECTION_STRING || '');
  }

  async executeQuery(query: string): Promise<Result<QueryResult, QueryError>> {
    try {
      await this.client.connect();
      const db = this.client.db();
      const result = await db.eval(query);
      return ok({
        data: result,
        metadata: {
          command: 'eval',
        },
      });
    } catch (error) {
      return err({
        message: 'Failed to execute MongoDB query',
        code: 'MONGODB_ERROR',
        details: error,
      });
    } finally {
      await this.client.close();
    }
  }
}
