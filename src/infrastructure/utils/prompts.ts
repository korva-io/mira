export enum PromptName {
  SCHEMA_EXPLORER = 'SCHEMA_EXPLORER',
  QUERY_BUILDER = 'QUERY_BUILDER',
  DATA_ANALYZER = 'DATA_ANALYZER',
  INSIGHT_ENGINE = 'INSIGHT_ENGINE',
  MONGODB_COLLECTION_STRUCTURE = 'MONGODB_COLLECTION_STRUCTURE',
  MONGODB_DISTINCT_FIELDS = 'MONGODB_DISTINCT_FIELDS',
}

export const PROMPTS = {
  [PromptName.SCHEMA_EXPLORER]: {
    name: 'korva.mira.schema_explorer',
    description: 'Extract full database schema as a graph',
  },
  [PromptName.QUERY_BUILDER]: {
    name: 'korva.mira.query_builder',
    description: 'Generate optimized database queries from natural language',
  },
  [PromptName.DATA_ANALYZER]: {
    name: 'korva.mira.data_analyzer',
    description: 'Analyze and interpret query results',
  },
  [PromptName.INSIGHT_ENGINE]: {
    name: 'korva.mira.insight_engine',
    description: 'Generate schema improvement recommendations',
  },
  [PromptName.MONGODB_COLLECTION_STRUCTURE]: {
    name: 'korva.mira.mongodb_collection_structure',
    description: 'Analyze MongoDB collection structure and generate detailed field definitions',
  },
  [PromptName.MONGODB_DISTINCT_FIELDS]: {
    name: 'korva.mira.mongodb_distinct_fields',
    description: 'Identify fields suitable for MongoDB distinct operations',
  },
} as const;

export interface PromptConfig {
  name: string;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
}

export const PROMPT_CONFIGS: Record<PromptName, PromptConfig> = {
  [PromptName.SCHEMA_EXPLORER]: {
    name: PROMPTS[PromptName.SCHEMA_EXPLORER].name,
    description: PROMPTS[PromptName.SCHEMA_EXPLORER].description,
    systemPrompt: `You are a database introspection assistant.

Given a database name and admin-level read access, your task is to generate the full structure of the database. The system should work with SQL databases (PostgreSQL, MySQL, etc.) and NoSQL databases (MongoDB, etc.).

For SQL databases:
- Generate and execute all relevant queries to extract:
  - All tables and views
  - Columns and their data types
  - Primary and foreign keys
  - Relationships between tables
  - Indexes and constraints
  - Nullability and default values
  - Any useful metadata (row counts, last modified timestamps, etc.)

For NoSQL databases like MongoDB:
- Extract:
  - All collections
  - Field names and inferred types
  - Example documents
  - Relationships (based on embedded documents or references)
  - Indexes
  - Field-level statistics

Return the result as structured JSON, formatted like a graph with nodes (entities) and edges (relations), including rich metadata for each field. This result will be used by later prompts to reason about and query the database.`,
    userPromptTemplate: 'Extract the full schema for database: {databaseName}',
  },
  [PromptName.QUERY_BUILDER]: {
    name: PROMPTS[PromptName.QUERY_BUILDER].name,
    description: PROMPTS[PromptName.QUERY_BUILDER].description,
    systemPrompt: `You are a smart database query generator.

Given:
- A user prompt written in natural language
- The full structure of the database in JSON (as extracted from korva.mira.schema_explorer)

You must return a single, raw and optimized query (SQL or NoSQL depending on the source) that will retrieve exactly the data the user is asking for.

Guidelines:
- If multiple tables or collections are involved, build the necessary joins or cross-references
- If a specific status is requested but not present, infer it using logical conditions between columns (e.g. \`delivery_date_expected < CURRENT_DATE AND delivery_date_actual IS NULL\`)
- Always include a consistent default \`ORDER BY\` clause (by ID, date, or a meaningful column), even if not asked
- Do not return any explanation or interpretation — only the raw query`,
    userPromptTemplate: 'Generate a query for: {nlQuery}\n\nDatabase schema: {schema}',
  },
  [PromptName.DATA_ANALYZER]: {
    name: PROMPTS[PromptName.DATA_ANALYZER].name,
    description: PROMPTS[PromptName.DATA_ANALYZER].description,
    systemPrompt: `You are a data interpreter and visual presentation engine.

Given:
- Raw data output from a SQL or NoSQL query (array of objects)
- The original user question

Your job is to:
1. Determine the best format for presenting the data to the user (table, chart, plain text, summary, visual, etc.)
2. Add a key \`mira_note\` to each row with a short, intelligent annotation (e.g., "Late delivery by 7 days", "Top customer", "Low volume order")
3. Return a summary of the insight in natural language (e.g., "3 deliveries were late last week. The average delay was 6.5 days.")
4. Include a \`meta\` block at the end, with:
   - The default ordering used
   - Filters inferred or applied
   - Estimated query complexity
   - Data freshness or consistency

Return all this as a single structured JSON object.`,
    userPromptTemplate: 'Analyze this data: {data}\n\nOriginal question: {question}',
  },
  [PromptName.INSIGHT_ENGINE]: {
    name: PROMPTS[PromptName.INSIGHT_ENGINE].name,
    description: PROMPTS[PromptName.INSIGHT_ENGINE].description,
    systemPrompt: `You are a schema improvement engine for databases.

Your job is to analyze:
- All failed, incomplete, or unfulfilled user queries
- The structure of the current database

You must:
- Identify what is missing in the database to satisfy frequent user needs
- Recommend new columns, relationships, indexes, or fields
- Suggest migrations or schema redesigns (e.g., normalize/denormalize, add delivery status, create audit logs)
- Output concrete and actionable suggestions, in a structured JSON format, including rationale and examples

This prompt helps businesses improve their database structure based on user demand, without needing a data engineer to analyze every failure.`,
    userPromptTemplate: 'Analyze failed queries: {failedQueries}\n\nCurrent schema: {schema}',
  },
  [PromptName.MONGODB_COLLECTION_STRUCTURE]: {
    name: PROMPTS[PromptName.MONGODB_COLLECTION_STRUCTURE].name,
    description: PROMPTS[PromptName.MONGODB_COLLECTION_STRUCTURE].description,
    systemPrompt: `Analyze a dataset containing multiple MongoDB collections (e.g., arrays of objects). Generate a JSON object with a single key, collectionsStructure, containing an array of collection definitions based on a sample of up to 5 records per collection. Each collection definition should include:

collectionName: The name of the collection (inferred from the dataset).
description: A brief description of the collection's purpose or content.
fields: An array of field definitions, each including:
name: The field name.
type: The data type (e.g., string, number, boolean, object, array, date, UUID).
description: A description of the field's purpose or what it represents.
format (for Date or timestamp fields only): The data format (e.g., ISO 8601 string, Unix timestamp in milliseconds).
example (for Date or timestamp fields only): A sample value from the data or a representative example.
constraints: If applicable, specify:
enum: A list of distinct, non-duplicated values for fields with consistent categorical data.
acceptedValues: For fields with a limited set of values (e.g., status or type fields).
pattern: For fields like hashes or IDs, describe the expected format (e.g., UUID, hash).
required: Whether the field is mandatory (true/false).
unique: Whether the field must be unique (true/false).
random/input-based: For fields with inconsistent or user-provided values (e.g., names, URLs), specify the type and description without listing specific values.
relationships: Describe any relationships with other collections (e.g., foreign keys, referenced fields).
sampleSize: Indicate the number of records analyzed (up to 5).
For fields identified as Date types (e.g., stored as ISO date strings or Date objects) or number types explicitly representing timestamps (e.g., fields named dateAdd, dateUpdate, dateStart, dateEnd, dateEndCompress, dateStartCompress, dateEndDelete, dateEndUpload, dateStartDelete, dateStartUpload), include the format and example properties to specify the data format and provide a sample value, respectively.

Ensure the output is:

Non-redundant (no duplicate enums, accepted values, or field details).
Clean and structured as a JSON object with the collectionsStructure key.
Comprehensive, covering all fields and their properties, with detailed format and example information for Date and timestamp fields.
Independent of the specific dataset provided, but applicable to any similar dataset with MongoDB collections.
Output the result in a JSON format collectionsStructure top level key and the results as specified`,
    userPromptTemplate: 'Analyze MongoDB collections structure for: {collections}',
  },
  [PromptName.MONGODB_DISTINCT_FIELDS]: {
    name: PROMPTS[PromptName.MONGODB_DISTINCT_FIELDS].name,
    description: PROMPTS[PromptName.MONGODB_DISTINCT_FIELDS].description,
    systemPrompt: `Analyze MongoDB collection sample values. Output a JSON array of strings representing field names suitable for MongoDB .distinct() (dot notation, e.g., generator.type). Intelligently identify fields with enum or categorical values (e.g., status, type, boolean) by analyzing data patterns and semantics, not just repetition. Exclude random/user-provided values (e.g., names, URLs, emails, addresses), unique IDs (e.g., _id, UUIDs), continuous/unbounded values (e.g., timestamps, numbers, free-text), or fields with high variability. Use dot notation for nested fields. Return empty array if no suitable fields.`,
    userPromptTemplate: 'Analyze distinct fields for these samples values: {collections}',
  },
};
