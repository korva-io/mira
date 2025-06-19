import { MongoClient, Db, IndexDescription, ObjectId } from 'mongodb';
import { Result, err, ok } from 'neverthrow';
import { DatabaseRepository } from '../interfaces';
import { QueryError, QueryResult } from '../../domain/types';
import { GrokApi } from '../grokApi';
import { truncateValue, truncateValueList } from '../utils/truncate';
import { RedisCache } from '../cache/redis';

// Import JsonItem type from truncate utils
interface JsonItem {
  [key: string]: unknown;
}

interface DatabaseMetadata {
  name: string;
  sizeOnDisk: number;
  empty: boolean;
  version: string;
  last_discovery_timestamp: string;
}

interface CollectionInfo {
  name: string;
  count: number;
  storageSize: number;
  capped: boolean;
  validator: Record<string, unknown> | null;
  last_discovery_timestamp: string;
}

interface CollectionSchema {
  name: string;
  capped: boolean;
  last_discovery_timestamp: string;
  fields: FieldSchema[];
  indexes: IndexDescription[];
  sampleFieldsValues: Record<string, unknown[]>;
  sampleDocuments?: unknown[];
  stats: {
    count: number;
    storageSize: number;
    avgObjSize: number;
    totalSize: number;
    size: number;
  };
}

interface FieldSchema {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  unique?: boolean;
  nullable?: boolean;
  // sampleValues?: unknown[]; too complex to handle
  description?: string;
  fields?: FieldSchema[];
  items?: { type: string }; // For arrays of primitives
  min?: number | Date;
  max?: number | Date;
  avg?: number;
}

interface CollectionsRelationship {
  source: {
    collectionName: string;
    field: string;
  };
  target: {
    collectionName: string;
    field: string;
  };
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  description: string;
  confidence: number;
}

interface DatabaseSchema {
  metadata: DatabaseMetadata;
  collectionsNames: string[];
  collectionsFields: {
    [collectionName: string]: string[];
  };
  collections: CollectionSchema[];
  relationships: CollectionsRelationship[];
}

export class MongoRepository implements DatabaseRepository {
  private cache: RedisCache;

  constructor() {
    this.cache = new RedisCache();
  }

  private async getDatabaseMetadata(db: Db): Promise<DatabaseMetadata> {
    const dbStats = await db.command({ dbStats: 1 });
    const buildInfo = await db.command({ buildInfo: 1 });

    return {
      name: db.databaseName,
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
      name: collectionName,
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
          });
        }
      }
    }

    return fields;
  }

  async discoverSchema(db: Db): Promise<DatabaseSchema> {
    const now = new Date().toISOString();
    const collectionsList = await db.listCollections().toArray();
    const collections: CollectionSchema[] = [];
    const collectionsFields: { [collectionName: string]: string[] } = {};
    const collectionsNames: string[] = [];

    // Get database metadata
    const metadata = await this.getDatabaseMetadata(db);

    // Process each collection
    for (const collection of collectionsList) {
      const info = await this.getCollectionInfo(db, collection.name);
      const fields = await this.inferCollectionSchema(db, collection.name);
      const indexes = await db.collection(collection.name).indexes();
      const stats = await db.command({ collStats: collection.name });

      collectionsNames.push(collection.name);
      collectionsFields[collection.name] = fields.map((f) => f.name);

      collections.push({
        name: collection.name,
        capped: info.capped,
        last_discovery_timestamp: now,
        fields,
        indexes: indexes as IndexDescription[],
        sampleFieldsValues: {}, // Will be populated later
        stats: {
          count: stats['count'] as number,
          storageSize: stats['storageSize'] as number,
          avgObjSize: (stats['avgObjSize'] as number) || 0,
          totalSize: stats['totalSize'] as number,
          size: stats['size'] as number,
        },
      });
    }

    return {
      metadata,
      collectionsNames,
      collectionsFields,
      collections,
      relationships: [], // Will be populated later
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

  private inferType(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'string') {
      if (ObjectId.isValid(value)) return 'ObjectId'; // Check for valid ObjectId string
      // Basic date regex, improve with a dedicated date parsing library if needed
      if (!isNaN(new Date(value).getTime()) && value.length >= 10 && value.includes('-'))
        return 'Date';
      return 'string';
    }
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) {
      if (value.length > 0) {
        // Infer type of first element for array items
        return `array<${this.inferType(value[0])}>`;
      }
      return 'array<any>';
    }
    if (typeof value === 'object') {
      if (value instanceof ObjectId) return 'ObjectId';
      if (value instanceof Date) return 'Date';
      return 'object';
    }

    return 'unknown';
  }

  private inferCollectionSchemaRecursive(obj: unknown): FieldSchema[] {
    const nestedSchema: FieldSchema[] = [];
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        const inferredType = this.inferType(value);
        const field: FieldSchema = {
          name: key,
          type: inferredType,
          nullable: value === null,
        };
        if (inferredType === 'object' && value !== null && !Array.isArray(value)) {
          field.fields = this.inferCollectionSchemaRecursive(value);
        } else if (inferredType.startsWith('array<') && Array.isArray(value) && value.length > 0) {
          field.items = { type: this.inferType(value[0]) };
        }
        nestedSchema.push(field);
      }
    }
    return nestedSchema;
  }

  private async buildCollectionFieldsSchemaAsync(
    db: Db,
    collectionName: string
  ): Promise<{ schema: FieldSchema[]; samples: unknown[] }> {
    const schema: FieldSchema[] = [];
    let samples: unknown[] = [];
    try {
      samples = await db
        .collection(collectionName)
        .aggregate([{ $sample: { size: 5 } }])
        .toArray();

      if (samples.length === 0) {
        return { schema, samples }; // No documents to infer schema from
      }

      const fieldMap: { [key: string]: FieldSchema & { values: unknown[] } } = {};

      samples.forEach((doc) => {
        for (const key in doc) {
          if (!Object.prototype.hasOwnProperty.call(doc, key)) continue;

          const value = doc[key];
          const inferredType = this.inferType(value);

          if (!fieldMap[key]) {
            fieldMap[key] = {
              name: key,
              type: inferredType,
              values: [value],
              nullable: value === null,
            };
            if (key === '_id') fieldMap[key].isPrimaryKey = true;
          } else {
            // If type changes across samples, mark as mixed or pick most common
            if (
              fieldMap[key].type !== inferredType &&
              fieldMap[key].type !== 'mixed' &&
              inferredType !== 'null'
            ) {
              fieldMap[key].type = 'mixed'; // Or prioritize a specific type
            }
            fieldMap[key].values.push(value);
            if (value === null) fieldMap[key].nullable = true;
          }

          // Handle nested objects/arrays recursively (simplified)
          if (inferredType === 'object' && value !== null && !Array.isArray(value)) {
            fieldMap[key].fields = this.inferCollectionSchemaRecursive(value);
          } else if (
            inferredType.startsWith('array<') &&
            Array.isArray(value) &&
            value.length > 0
          ) {
            fieldMap[key].items = { type: this.inferType(value[0]) }; // Only infer first item type
          }
        }
      });

      // Finalize schema by processing collected values for min/max/avg/unique
      for (const key in fieldMap) {
        const field = fieldMap[key];
        // Remove temporary values array
        delete (field as any).values;

        // field.sampleValues = sampleDocuments;
        schema.push(field as FieldSchema);
      }
    } catch (error) {
      console.warn(`Could not infer schema for collection ${collectionName}:`, error);
      // Return empty schema on error, or log it more verbosely
    }

    return { schema, samples };
  }

  private async getCollectionFieldsNamesAsync(db: Db, collectionName: string): Promise<string[]> {
    const collection = db.collection(collectionName);

    // Get a sample document to extract field names
    const sampleDoc = await collection.findOne();

    if (!sampleDoc) {
      return []; // No documents in collection
    }

    // Extract field names from the document structure
    const fieldsNames = Object.keys(sampleDoc);

    return fieldsNames;
  }

  private async buildDatabaseStructureAsync(db: Db): Promise<DatabaseSchema> {
    try {
      // 1. get the database schema with metadata, collections names list
      const collectionsFields: { [collectionName: string]: string[] } = {};
      const metadata = await this.getDatabaseMetadata(db);
      const collectionsNames = (await db.listCollections().toArray()).map(
        (collection) => collection.name
      );
      // 2. get the fields names for each collection
      for (const collectionName of collectionsNames) {
        collectionsFields[collectionName] = await this.getCollectionFieldsNamesAsync(
          db,
          collectionName
        );
      }
      // 3. for each collection, build the collection structure
      const collections = await Promise.all(
        collectionsNames.map(async (collection) => {
          return await this.buildCollectionStructureAsync(db, collection);
        })
      );

      // 4. build the relationships between collections (using ai)
      const relationships = await this.buildCollectionsRelationshipsAsync(collections);
      // 5. TODO: save to db and cache
      // 6. return the database schema
      return {
        metadata,
        collectionsNames,
        collectionsFields,
        collections,
        relationships,
      };
    } catch (error) {
      console.error('Error building database structure: ', error);
      throw error;
    }
  }

  private async buildCollectionSchemaAsync(
    db: Db,
    collectionName: string
  ): Promise<CollectionSchema> {
    const stats: Record<string, unknown> = await db.command({ collStats: collectionName });
    const indexes: IndexDescription[] = await db.collection(collectionName).indexes();
    const { schema: fields, samples: sampleDocuments } =
      await this.buildCollectionFieldsSchemaAsync(db, collectionName);

    return {
      name: collectionName,
      capped: stats['capped'] as boolean,
      last_discovery_timestamp: new Date().toISOString(),
      indexes,
      sampleDocuments,
      fields,
      sampleFieldsValues: {}, // Initialize with empty object, will be populated later
      stats: {
        count: stats['count'] as number,
        storageSize: stats['storageSize'] as number,
        avgObjSize: (stats['avgObjSize'] as number) || 0,
        totalSize: stats['totalSize'] as number,
        size: stats['size'] as number,
      },
    };
  }

  private async buildCollectionStructureAsync(
    db: Db,
    collectionName: string
  ): Promise<CollectionSchema | null> {
    const grokApi = new GrokApi();
    // 1. get the collection schema with types, samples, indexes, stats, etc.
    const { sampleDocuments, ...coreSchema } = await this.buildCollectionSchemaAsync(
      db,
      collectionName
    );

    // 2. minify samples and schema(truncate strings, limit arrays, etc.)
    const minifiedSamples = truncateValueList((sampleDocuments || []).slice(0, 5) as JsonItem[]);
    const cacheKey = `user-uuid:grokApi.analyzeMongoDBCollectionStructure:${db?.databaseName}:${collectionName}`;
    const cachedResult: string | null = await this.cache.get(cacheKey);
    // const potentialDistinctFields: string | null = await this.cache.get(cacheKey);

    let potentialDistinctFields: string[] = [];

    if (cachedResult) {
      potentialDistinctFields = JSON.parse(cachedResult) as string[];
    } else if (minifiedSamples.length > 0) {
      // 3. ai identify distinct fields candidates
      potentialDistinctFields = await grokApi.analyzeMongoDBDistinctFields(minifiedSamples);
      await this.cache.set(cacheKey, JSON.stringify(potentialDistinctFields), 3600 * 24 * 5); // Cache for 5 days
    }

    // 4. get distinct values for each identified field
    if (potentialDistinctFields.length > 0) {
      const distinctValues: Record<string, unknown[]> = {};

      // Process each field individually for better control and debugging
      for (const fieldName of potentialDistinctFields) {
        try {
          const fieldValues = await db
            .collection(collectionName)
            .aggregate([
              {
                $match: {
                  [fieldName]: { $exists: true, $ne: null },
                },
              },
              {
                $project: {
                  fieldValue: {
                    $cond: {
                      if: { $isArray: `$${fieldName}` },
                      then: `$${fieldName}`,
                      else: [`$${fieldName}`],
                    },
                  },
                },
              },
              { $unwind: '$fieldValue' },
              {
                $match: {
                  fieldValue: { $exists: true, $ne: null },
                },
              },
              {
                $group: {
                  _id: '$fieldValue',
                },
              },
              {
                $limit: 10, // Limit to 10 distinct values per field
              },
              {
                $project: {
                  _id: 0,
                  value: '$_id',
                },
              },
            ])
            .toArray();

          distinctValues[fieldName] = fieldValues.map((doc) => truncateValue(doc['value']));
        } catch (error) {
          console.warn(`Failed to get distinct values for field ${fieldName}:`, error);
          distinctValues[fieldName] = [];
        }
      }

      coreSchema.sampleFieldsValues = distinctValues;
    } else {
      coreSchema.sampleFieldsValues = {};
    }

    // 5. ai generate schema / graph with descriptions, types and examples
    // 6. minify schema with dot notation and include types
    // 7. save to db and cache
    // 8. return the schema

    return coreSchema;
    const schema = await this.discoverSchema(db);
    return schema.collections[collectionName];
  }

  private async buildCollectionsRelationshipsAsync(
    collectionsSchema: CollectionSchema[]
  ): Promise<CollectionsRelationship[]> {
    // 1. minify each collection schema
    // 2. ai identify / infer relationships between collections from minified schema
    // 3. save to db and cache
    // 4. return the relationships
  }

  async healthCheckQuery(
    connectionString: string,
    query: string,
    params: unknown[] = []
  ): Promise<DatabaseSchema | null> {
    const client = new MongoClient(connectionString);
    const startTime = Date.now();

    const cache = new RedisCache();
    const grokApi = new GrokApi();

    try {
      await client.connect();

      const dbs = await this.getDbs(client, connectionString);
      const schemas = await Promise.allSettled(
        [dbs[5]].map(async (db) => {
          const rest = await this.buildDatabaseStructureAsync(db);
          return rest;

          const schema = await this.discoverSchema(db);

          const structures: Record<string, unknown>[] = [];

          for (const collectionName in schema.collections) {
            const collections = {
              collectionName: collectionName,
              randomSamples: truncateValueList(
                schema.collections[collectionName].sampleFieldsValues as JsonItem[]
              ),
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
      // await client.close();
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
