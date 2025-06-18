onst SCHEMA_SAMPLE_SIZE = 10;
const startOfDay = 1750022400;
const endOfDay = 1750108799;

// const query1 = [
//   {
//     $match: {
//       exportType: 'video480p',
//       dateStartUpload: {
//         $gte: 1750022400, // June 15, 2025, 00:00:00 UTC
//         $lte: 1750108799, // June 15, 2025, 23:59:59.999 UTC
//       },
//     },
//   },
//   {
//     $lookup: {
//       from: 'processed_files_metadata',
//       localField: 'rawUuid',
//       foreignField: 'rawUuid',
//       as: 'metadata',
//     },
//   },
//   {
//     $unwind: '$metadata',
//   },
//   {
//     $project: {
//       _id: 0,
//       fileName: '$metadata.fileName',
//       slackThreadId: '$metadata.slackThreadId',
//     },
//   },
// ];

console.log('startOfDay: ', startOfDay);
console.log('endOfDay: ', endOfDay);

const query1 = [
    {
        $match: {
            exportType: 'video480p', // Corrected to match sample data
            dateStartUpload: {
                $gte: startOfDay,
                $lte: endOfDay,
            },
            isUploaded: true, // Ensure file was uploaded
        },
    },
    {
        $lookup: {
            from: 'processed_files_metadata',
            localField: 'rawUuid',
            foreignField: 'rawUuid',
            as: 'metadata',
        },
    },
    {
        $unwind: {
            path: '$metadata',
            preserveNullAndEmptyArrays: true, // Keep documents without metadata
        },
    },
    {
        $project: {
            _id: 0, // Exclude internal ID
            rawUuid: 1, // Source file identifier
            uuid: 1, // Processed file identifier
            fileName: { $ifNull: ['$metadata.fileName', 'Unknown'] }, // Fallback for missing metadata
            slackThreadId: { $ifNull: ['$metadata.slackThreadId', null] }, // Fallback for missing Slack ID
            fileExtension: 1, // e.g., 'mov'
            fileSizeMB: 1, // e.g., 108.56
            sourceUrl: 1, // File origin
            exportType: 1, // e.g., 'video480p'
            isCompressed: 1, // Compression status
            isUploaded: 1, // Upload status
            isDeleted: { $ifNull: ['$isDeleted', false] }, // Fallback for missing isDeleted
            dateStartUpload: {
                timestamp: '$dateStartUpload', // Raw seconds
                iso: { $toDate: { $multiply: ['$dateStartUpload', 1000] } }, // Convert to ISO
            },
            dateEndUpload: {
                timestamp: '$dateEndUpload',
                iso: { $toDate: { $multiply: ['$dateEndUpload', 1000] } },
            },
            dateAdd: {
                timestamp: '$dateAdd',
                iso: { $toDate: { $multiply: ['$dateAdd', 1000] } },
            },
            dateStartCompress: {
                timestamp: '$dateStartCompress',
                iso: { $toDate: { $multiply: ['$dateStartCompress', 1000] } },
            },
            dateEndCompress: {
                timestamp: '$dateEndCompress',
                iso: { $toDate: { $multiply: ['$dateEndCompress', 1000] } },
            },
        },
    },
    {
        $sort: {
            'dateStartUpload.timestamp': -1, // Sort by upload start, newest first
        },
    },
];

const query2 = [
    {
        $match: {
            exportType: '720p',
            dateAdd: {
                $gte: 1621296000000, // May 17, 2025, 00:00:00 UTC
                $lte: 1623801599999, // June 15, 2025, 23:59:59.999 UTC
            },
        },
    },
    {
        $group: {
            _id: {
                $dateTrunc: {
                    date: { $toDate: '$dateAdd' },
                    unit: 'day',
                },
            },
            count: { $sum: 1 },
        },
    },
    {
        $group: {
            _id: null,
            averagePerDay: { $avg: '$count' },
        },
    },
    {
        $project: {
            _id: 0,
            averagePerDay: 1,
        },
    },
];

interface FieldSchema {
    name: string;
    type: string;
    is_primary_key?: boolean;
    unique?: boolean;
    nullable?: boolean;
    // Nested fields for objects/arrays of objects
    fields?: FieldSchema[];
    items?: { type: string }; // For arrays of primitives
    sample_values?: unknown[];
    min?: number | Date;
    max?: number | Date;
    avg?: number;
}

interface CollectionSchema {
    name: string;
    last_discovery_timestamp: string;
    fields: FieldSchema[];
    indexes: unknown[]; // MongoDB index documents
    relationships?: unknown[]; // Manually defined or inferred relationships
}

/**
 * Infer a basic type from a JavaScript value.
 * This is a simplified type inference. A more robust solution might use
 * statistical analysis over more samples.
 */
function inferType(value: unknown): string {
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
            return `array<${inferType(value[0])}>`;
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

/**
 * Infer schema for a given collection by sampling documents.
 */
async function inferCollectionSchema(db: Db, collectionName: string): Promise<FieldSchema[]> {
    const schema: FieldSchema[] = [];
    try {
        const sampleDocuments = await db
            .collection(collectionName)
            .find({})
            .limit(SCHEMA_SAMPLE_SIZE)
            .toArray();

        if (sampleDocuments.length === 0) {
            return []; // No documents to infer schema from
        }

        const fieldMap: { [key: string]: FieldSchema & { values: any[] } } = {};

        sampleDocuments.forEach((doc) => {
            for (const key in doc) {
                if (!Object.prototype.hasOwnProperty.call(doc, key)) continue;

                const value = doc[key];
                const inferredType = inferType(value);

                if (!fieldMap[key]) {
                    fieldMap[key] = {
                        name: key,
                        type: inferredType,
                        values: [value],
                        nullable: value === null,
                    };
                    if (key === '_id') fieldMap[key].is_primary_key = true;
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
                    fieldMap[key].fields = inferCollectionSchemaRecursive(value);
                } else if (inferredType.startsWith('array<') && Array.isArray(value) && value.length > 0) {
                    fieldMap[key].items = { type: inferType(value[0]) }; // Only infer first item type
                }
            }
        });

        // Finalize schema by processing collected values for min/max/avg/unique
        for (const key in fieldMap) {
            const field = fieldMap[key];
            // Remove temporary values array
            delete (field as any).values;
            schema.push(field);
        }
    } catch (error) {
        console.warn(`Could not infer schema for collection ${collectionName}:`, error);
        // Return empty schema on error, or log it more verbosely
    }
    return schema;
}

// Recursive helper for nested objects (simplified)
function inferCollectionSchemaRecursive(obj: any): FieldSchema[] {
    const nestedSchema: FieldSchema[] = [];
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            const inferredType = inferType(value);
            const field: FieldSchema = {
                name: key,
                type: inferredType,
                nullable: value === null,
            };
            if (inferredType === 'object' && value !== null && !Array.isArray(value)) {
                field.fields = inferCollectionSchemaRecursive(value);
            } else if (inferredType.startsWith('array<') && Array.isArray(value) && value.length > 0) {
                field.items = { type: inferType(value[0]) };
            }
            nestedSchema.push(field);
        }
    }
    return nestedSchema;
}

/**
 * Discovers MongoDB schema and stores it in Redis.
 */
export async function discoverAndStoreSchema(db: Db): Promise<void> {
    try {
        console.log('Starting MongoDB schema discovery...');

        const now = new Date().toISOString();

        // 1. Store DB Metadata
        const dbStats = await db.command({ dbStats: 1 });
        const buildInfo = await db.command({ buildInfo: 1 });
        const dbMetadata = {
            name: db.databaseName,
            sizeOnDisk: dbStats.dataSize,
            empty: dbStats.objects === 0,
            version: buildInfo.version,
            last_discovery_timestamp: now,
        };

        console.log(`Stored DB metadata for ${db.databaseName}`);
        console.log('dbMetadata: ', JSON.stringify(dbMetadata, null, 2));

        // 2. Store List of Collections and their basic info
        const collectionsList = await db.listCollections().toArray();
        const collectionInfoMap: { [key: string]: string } = {}; // Store as JSON strings in hash
        const collectionNames: string[] = [];

        for (const coll of collectionsList) {
            collectionNames.push(coll.name);
            // Use collStats command instead of stats() method
            const collStats = await db.command({ collStats: coll.name });
            collectionInfoMap[coll.name] = JSON.stringify({
                count: collStats.count,
                storageSize: collStats.storageSize,
                capped: collStats.capped,
                validator: coll.options?.validator || null,
                last_discovery_timestamp: now,
            });
        }

        if (Object.keys(collectionInfoMap).length > 0) {
            // await redisClient.hset(REDIS_KEY_COLLECTIONS_LIST(db.databaseName), collectionInfoMap);
            console.log('collectionInfoMap: ', JSON.stringify(collectionInfoMap, null, 2));
        }
        console.log(`Stored collection list for ${db.databaseName}: ${collectionNames.join(', ')}`);

        // 3. Store Detailed Collection Schemas and Indexes
        for (const collectionName of collectionNames) {
            // Infer and store schema
            const fields = await inferCollectionSchema(db, collectionName);
            const collectionSchema: CollectionSchema = {
                name: collectionName,
                last_discovery_timestamp: now,
                fields: fields,
                indexes: await db.collection(collectionName).indexes(),
                // Add manually defined relationships here if you have them,
                // or a more sophisticated inference module
                relationships: [],
            };
            console.log('collectionSchema: ', JSON.stringify(collectionSchema, null, 2));
        }

        console.log('MongoDB schema discovery and storage to Redis completed successfully.');
    } catch (error) {
        console.error('Error during schema discovery and storage:', error);
    } finally {
        console.log('MongoDB schema discovery and storage to Redis completed successfully.');
    }
}

export async function getRandomItemsByCollection(db: Db): Promise<Record<string, unknown[]>> {
    const randomItemsByCollection: Record<string, unknown[]> = {};

    const collectionsList = await db.listCollections().toArray();
    const collectionNames = collectionsList.map((collection) => collection.name);

    for (const collectionName of collectionNames) {
        try {
            const collection = db.collection(collectionName);
            // Aggregation pipeline to get 5 random documents
            const randomDocs = await collection.aggregate([{ $sample: { size: 5 } }]).toArray();
            randomItemsByCollection[collectionName] = randomDocs;
        } catch (err) {
            // Handle cases where a collection might not exist or other errors
            console.warn(`Could not get random items for collection ${collectionName}: ${err.message}`);
            randomItemsByCollection[collectionName] = { error: err.message };
        }
    }

    return randomItemsByCollection;
}