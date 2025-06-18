import { MongoClient, Db, Document, WithId } from 'mongodb';
import { Result, err, ok } from 'neverthrow';
import { DatabaseRepository } from '../interfaces';
import { QueryError, QueryResult } from '../../domain/types';
import { GrokApi } from '../grokApi';
import { truncateValueList } from '../utils/truncate';
import { RedisCache } from '../cache/redis';

interface DatabaseMetadata {
  databaseName: string;
  sizeOnDisk: number;
  empty: boolean;
  version: string;
  last_discovery_timestamp: string;
}

interface CollectionInfo {
  collectionName: string;
  count: number;
  storageSize: number;
  capped: boolean;
  validator: Record<string, unknown> | null;
  last_discovery_timestamp: string;
}

interface CollectionSchema {
  name: string;
  last_discovery_timestamp: string;
  fields: FieldSchema[];
  indexes: Record<string, unknown>[];
  relationships: Record<string, unknown>[];
}

interface FieldSchema {
  name: string;
  type: string;
  nullable: boolean;
  unique: boolean;
  indexed: boolean;
  values?: unknown[];
}

interface DatabaseSchema {
  metadata: DatabaseMetadata;
  collections: {
    [key: string]: {
      info: CollectionInfo;
      schema: CollectionSchema;
    };
  };
  randomSamples: {
    [key: string]: Record<string, unknown>[];
  };
}

export class MongoRepository implements DatabaseRepository {
  private async getDatabaseMetadata(db: Db): Promise<DatabaseMetadata> {
    const dbStats = await db.command({ dbStats: 1 });
    const buildInfo = await db.command({ buildInfo: 1 });

    return {
      databaseName: db.databaseName,
      sizeOnDisk: dbStats['dataSize'] as number,
      empty: dbStats['objects'] === 0,
      version: buildInfo['version'] as string,
      last_discovery_timestamp: new Date().toISOString(),
    };
  }

  private async getCollectionInfo(db: Db, collectionName: string): Promise<CollectionInfo> {
    const collStats = await db.command({ collStats: collectionName });
    const collection = db.collection(collectionName);
    const options = await collection.options();

    return {
      collectionName: collectionName,
      count: collStats['count'] as number,
      storageSize: collStats['storageSize'] as number,
      capped: collStats['capped'] as boolean,
      validator: options?.validator as Record<string, unknown> | null,
      last_discovery_timestamp: new Date().toISOString(),
    };
  }

  private async getRandomSamples(
    db: Db,
    sampleSize: number = 2
  ): Promise<Record<string, Record<string, unknown>[]>> {
    const randomItemsByCollection: Record<string, Record<string, unknown>[]> = {};
    const collectionsList = await db.listCollections().toArray();

    for (const collection of collectionsList) {
      try {
        const randomDocs = await db
          .collection(collection.name)
          .aggregate([{ $sample: { size: sampleSize } }])
          .toArray();
        randomItemsByCollection[collection.name] = randomDocs as Record<string, unknown>[];
      } catch (error) {
        console.warn(
          `Could not get random items for collection ${collection.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        randomItemsByCollection[collection.name] = [];
      }
    }

    return randomItemsByCollection;
  }

  private async inferCollectionSchema(db: Db, collectionName: string): Promise<FieldSchema[]> {
    const collection = db.collection(collectionName);
    const sampleDocs = await collection.find().limit(10).toArray();
    const fields: FieldSchema[] = [];

    if (sampleDocs.length > 0) {
      const firstDoc = sampleDocs[0] as Record<string, unknown>;
      for (const [key, value] of Object.entries(firstDoc)) {
        if (key !== '_id') {
          fields.push({
            name: key,
            type: typeof value,
            nullable: sampleDocs.some((doc) => (doc as Record<string, unknown>)[key] === null),
            unique: false, // Would need to check indexes to determine this
            indexed: false, // Would need to check indexes to determine this
            values: sampleDocs
              .map((doc) => (doc as Record<string, unknown>)[key])
              .filter((v) => v !== null),
          });
        }
      }
    }

    return fields;
  }

  async discoverSchema(db: Db): Promise<DatabaseSchema> {
    const now = new Date().toISOString();
    const collectionsList = await db.listCollections().toArray();
    const collections: { [key: string]: { info: CollectionInfo; schema: CollectionSchema } } = {};
    // Get database metadata
    const metadata = await this.getDatabaseMetadata(db);

    // Process each collection
    for (const collection of collectionsList) {
      const info = await this.getCollectionInfo(db, collection.name);
      const fields = await this.inferCollectionSchema(db, collection.name);
      const indexes = await db.collection(collection.name).indexes();

      collections[collection.name] = {
        info,
        schema: {
          name: collection.name,
          last_discovery_timestamp: now,
          fields,
          indexes: indexes as Record<string, unknown>[],
          relationships: [], // Would need more sophisticated analysis to determine relationships
        },
      };
    }

    // Get random samples
    const randomSamples = await this.getRandomSamples(db);

    return {
      metadata,
      collections,
      randomSamples,
    };
  }

  async executeQuery(
    connectionString: string,
    query: string,
    params: unknown[] = []
  ): Promise<Result<QueryResult, QueryError>> {
    const client = new MongoClient(connectionString);
    const startTime = Date.now();

    try {
      await client.connect();
      const db = client.db();

      // For MongoDB, we'll use runCommand for now, but in production you might want to use a proper query parser
      const result = await db.command({
        eval: query,
        args: params,
      });
      const executionTime = Date.now() - startTime;

      return ok({
        data: Array.isArray(result) ? result : [result],
        metadata: {
          executionTime,
          queryType: 'mongodb',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      return err({
        message: 'Failed to execute MongoDB query',
        code: 'MONGODB_ERROR',
        details: error,
      });
    } finally {
      await client.close();
    }
  }

  async healthCheckQuery(
    connectionString: string,
    query: string,
    params: unknown[] = []
  ): Promise<Result<QueryResult, QueryError>> {
    const client = new MongoClient(connectionString);
    const startTime = Date.now();

    const cache = new RedisCache();
    const grokApi = new GrokApi();

    try {
      await client.connect();

      const dbs = await this.getDbs(client, connectionString);
      const schemas = await Promise.allSettled(
        [dbs[0]].map(async (db) => {
          const schema = await this.discoverSchema(db);

          const structures: Record<string, unknown>[] = [];

          for (const collectionName in schema.collections) {
            const collections = {
              collectionName: collectionName,
              randomSamples: truncateValueList(schema.randomSamples[collectionName] as JsonItem[]),
              rawCollectionInfo: schema.collections[collectionName],
              databaseMetadata: schema.metadata,
            };

            try {
              // check the cache first
              const cacheKey = `user-uuid:grokApi.analyzeMongoDBCollectionStructure:${db?.databaseName}:${collectionName}`;
              const cachedResult = await cache.get(cacheKey);
              let structure: Record<string, unknown> | null = null;

              if (cachedResult) {
                structure = JSON.parse(cachedResult) as Record<string, unknown>;
              } else {
                structure = await grokApi.analyzeMongoDBCollectionStructure([collections]);
                await cache.set(cacheKey, JSON.stringify(structure), 3600 * 24 * 5); // Cache for 5 days
              }

              structures.push({
                structure,
                collectionName: collectionName,
                randomSamples: collections.randomSamples,
              });
            } catch (error) {
              console.error(
                'Error analyzing collection structure with name: ',
                collectionName,
                error
              );
            }

            // console.log('structure: ', structure);
          }

          // console.log('schema: ', schema);

          // const structure = await grokApi.analyzeMongoDBCollectionStructure({collections: schema});

          return {
            dbName: db?.databaseName,
            structures,
          };
        })
      );

      return ok({
        data: schemas.map((schema) => (schema.status === 'fulfilled' ? schema.value : null)),
        metadata: {
          executionTime: Date.now() - startTime,
          queryType: 'mongodb',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      return err({
        message: 'Failed to execute MongoDB query',
        code: 'MONGODB_ERROR',
        details: error,
      });
    } finally {
      await client.close();
    }
  }

  private isClusterUri(uri: string): boolean {
    const match = uri.match(/^[^?]+\/([^/?]+)(\?|$)/);
    return !match || match[1] === 'test';
  }

  private async getDbs(client: MongoClient, uri: string): Promise<Db[]> {
    try {
      if (this.isClusterUri(uri)) {
        const adminDb = client.db('admin');
        const dbNames = await adminDb.admin().listDatabases();
        return dbNames.databases.map((db) => client.db(db.name));
      } else {
        const dbName = client.db().databaseName;
        return [client.db(dbName)];
      }
    } catch (error) {
      return [];
    }
  }
}
