import { MongoClient } from 'mongodb';
import { Result, err, ok } from 'neverthrow';
import { DatabaseRepository } from '../interfaces';
import { QueryError } from '../../domain/types';

export class MongoRepository implements DatabaseRepository {
  async executeQuery(
    query: string,
    _dbType: string,
    connectionString: string
  ): Promise<Result<any[], QueryError>> {
    let client: MongoClient | null = null;
    try {
      // Create a new client with the provided connection string
      client = new MongoClient(connectionString);
      await client.connect();
      
      const db = client.db();
      
      // Parse and execute the MongoDB query
      // The query should be a JSON string containing the collection name and operation
      const queryObj = JSON.parse(query);
      const collection = db.collection(queryObj.collection);
      
      let result: any[];
      if (queryObj.operation === 'find') {
        result = await collection.find(queryObj.filter || {}).toArray();
      } else if (queryObj.operation === 'aggregate') {
        result = await collection.aggregate(queryObj.pipeline || []).toArray();
      } else {
        throw new Error(`Unsupported MongoDB operation: ${queryObj.operation}`);
      }
      
      return ok(result);
    } catch (error: any) {
      return err({
        message: `Failed to execute MongoDB query: ${error.message}`,
        code: 'MONGODB_ERROR',
        details: error,
      });
    } finally {
      // Clean up the connection
      if (client) {
        await client.close();
      }
    }
  }
}
