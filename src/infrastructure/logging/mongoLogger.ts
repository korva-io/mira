import { MongoClient } from 'mongodb';
import { Logger } from '../interfaces';
import { Result } from 'neverthrow';

export class MongoLogger implements Logger {
  private client: MongoClient;
  private dbName: string;

  constructor() {
    this.client = new MongoClient(process.env['MONGODB_CONNECTION_STRING'] || '');
    this.dbName = process.env['MONGODB_DB_NAME'] || 'mira';
  }

  async logQuery(params: {
    userId: string;
    nlQuery: string;
    dbType: string;
    result: Result<any, any>;
  }): Promise<void> {
    try {
      await this.client.connect();
      const db = this.client.db(this.dbName);
      const collection = db.collection('query_logs');

      await collection.insertOne({
        ...params,
        timestamp: new Date(),
        success: params.result.isOk(),
      });
    } finally {
      await this.client.close();
    }
  }
}
