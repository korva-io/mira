import { Pool } from 'pg';
import { MongoClient } from 'mongodb';
import { Result, err, ok } from 'neverthrow';
import { QueryError } from '../../domain/types';

export class SchemaExtractor {
  async extractPostgresSchema(connectionString: string): Promise<Result<string, QueryError>> {
    let pool: Pool | null = null;
    try {
      console.log('🔗 Connecting to PostgreSQL...');
      pool = new Pool({ connectionString });
      
      // Test the connection first
      await pool.query('SELECT 1');
      console.log('✅ PostgreSQL connection successful');

      // Extract tables and columns
      const tablesQuery = `
        SELECT 
          t.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          tc.constraint_type
        FROM information_schema.tables t
        LEFT JOIN information_schema.columns c 
          ON t.table_name = c.table_name 
          AND t.table_schema = c.table_schema
        LEFT JOIN information_schema.key_column_usage kcu
          ON c.table_name = kcu.table_name 
          AND c.column_name = kcu.column_name
          AND c.table_schema = kcu.table_schema
        LEFT JOIN information_schema.table_constraints tc
          ON kcu.constraint_name = tc.constraint_name
          AND kcu.table_schema = tc.table_schema
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name, c.ordinal_position;
      `;

      const result = await pool.query(tablesQuery);

      // Group by table
      const schema: Record<string, any> = {};
      for (const row of result.rows) {
        if (!schema[row.table_name]) {
          schema[row.table_name] = {
            name: row.table_name,
            columns: [],
          };
        }
        schema[row.table_name].columns.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
          default: row.column_default,
          constraint: row.constraint_type,
        });
      }

      // Get foreign keys
      const fkQuery = `
        SELECT
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public';
      `;

      const fkResult = await pool.query(fkQuery);
      const relationships = fkResult.rows.map((row) => ({
        from: row.table_name,
        column: row.column_name,
        to: row.foreign_table_name,
        foreignColumn: row.foreign_column_name,
      }));

      const fullSchema = {
        type: 'postgres',
        tables: Object.values(schema),
        relationships,
      };

      return ok(JSON.stringify(fullSchema, null, 2));
    } catch (error: any) {
      console.error('❌ PostgreSQL schema extraction error:', error);
      return err({
        message: `Failed to extract PostgreSQL schema: ${error.message || error.toString()}`,
        code: 'SCHEMA_EXTRACTION_ERROR',
        details: {
          error: error.message,
          stack: error.stack,
          code: error.code,
        },
      });
    } finally {
      if (pool) {
        try {
          await pool.end();
        } catch (e) {
          console.error('Error closing pool:', e);
        }
      }
    }
  }

  async extractMongoSchema(connectionString: string): Promise<Result<string, QueryError>> {
    let client: MongoClient | null = null;
    try {
      console.log('🔗 Connecting to MongoDB...');
      client = new MongoClient(connectionString);
      await client.connect();
      console.log('✅ MongoDB connection successful');

      const db = client.db();
      const collections = await db.listCollections().toArray();

      const schema: Record<string, any> = {};

      for (const collection of collections) {
        const collectionName = collection.name;
        const coll = db.collection(collectionName);

        // Sample documents to infer schema
        const samples = await coll.find({}).limit(10).toArray();

        if (samples.length > 0) {
          const fields = new Set<string>();
          const fieldTypes: Record<string, Set<string>> = {};

          for (const doc of samples) {
            for (const [key, value] of Object.entries(doc)) {
              fields.add(key);
              if (!fieldTypes[key]) {
                fieldTypes[key] = new Set();
              }
              fieldTypes[key].add(typeof value);
            }
          }

          schema[collectionName] = {
            name: collectionName,
            fields: Array.from(fields).map((field) => ({
              name: field,
              types: Array.from(fieldTypes[field] || []),
            })),
            sampleCount: samples.length,
          };
        }

        // Get indexes
        const indexes = await coll.indexes();
        schema[collectionName].indexes = indexes;
      }

      const fullSchema = {
        type: 'mongodb',
        collections: Object.values(schema),
      };

      return ok(JSON.stringify(fullSchema, null, 2));
    } catch (error: any) {
      console.error('❌ MongoDB schema extraction error:', error);
      return err({
        message: `Failed to extract MongoDB schema: ${error.message || error.toString()}`,
        code: 'SCHEMA_EXTRACTION_ERROR',
        details: {
          error: error.message,
          stack: error.stack,
          code: error.code,
        },
      });
    } finally {
      if (client) {
        try {
          await client.close();
        } catch (e) {
          console.error('Error closing MongoDB client:', e);
        }
      }
    }
  }

  async extractSchema(
    connectionString: string,
    dbType: string
  ): Promise<Result<string, QueryError>> {
    if (dbType === 'postgres') {
      return this.extractPostgresSchema(connectionString);
    } else if (dbType === 'mongodb') {
      return this.extractMongoSchema(connectionString);
    } else {
      return err({
        message: `Unsupported database type: ${dbType}`,
        code: 'UNSUPPORTED_DB_TYPE',
      });
    }
  }
}
