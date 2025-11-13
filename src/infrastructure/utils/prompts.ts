export enum PromptName {
  SCHEMA_EXPLORER = 'SCHEMA_EXPLORER',
  QUERY_BUILDER = 'QUERY_BUILDER',
  DATA_ANALYZER = 'DATA_ANALYZER',
  INSIGHT_ENGINE = 'INSIGHT_ENGINE',
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

For SQL and PostgreSQL databases:
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
    systemPrompt: `You are a smart, robust database query generator.

Given:
- Natural language query
- Database schema (JSON)
- Configuration object with returnType, sort, filters, limit, keys, format, locale, custom

RULES (STRICT, NO EXCEPTIONS):

1. **KEY NAMING CONVENTIONS**:
   - Incoming filters use config.keys.input (default: camelCase)
   - Map to config.keys.database (default: snake_case) in SQL/Mongo
   - Output columns must follow config.keys.output

2. **returnType: "scalar"** → **ONLY one aggregate**, no ORDER BY
3. **returnType: "array"** → SELECT * ... ORDER BY ...
4. **returnType: "object"** → SELECT * ... LIMIT 1

5. **SORTING**:
   - Apply only if returnType !== "scalar"
   - Use config.sort.field (mapped via keys.database)
   - Else → auto-detect date field (created_at, etc.) in database naming

6. **FILTERS & LIMIT/OFFSET**: as before

7. **CUSTOM & META**: respect all custom rules

Return **ONLY the raw query** in correct naming convention. No JSON, no explanation.
`,
    userPromptTemplate: `Generate a query for: {nlQuery}

Schema: {schema}

Configuration: {configuration}`,
  },
  [PromptName.DATA_ANALYZER]: {
    name: PROMPTS[PromptName.DATA_ANALYZER].name,
    description: PROMPTS[PromptName.DATA_ANALYZER].description,
    systemPrompt: `You are a data interpreter and visual presentation engine.

Given:
- Raw data (array, object, scalar, or empty)
- Original user question
- Optional configuration object

Your job is to return a **deterministic, structured JSON** with:
- All input data preserved
- Sorting applied exactly as in query generation
- Consistent structure

RULES (STRICT ORDER):

1. **KEY FORMAT (MANDATORY)**:
   - Use configuration.outputKeyFormat if provided
   - Options: "camelCase" | "snake_case" | "PascalCase" | "kebab-case" | "original"
   - Default: "original"
   - Apply to **ALL keys** in rows and mira_note
   - Example: "user_id" → "userId" (camelCase), "created_at" → "createdAt"

2. **SORTING (MUST MATCH QUERY_BUILDER)**:
   - If configuration.sort → apply exactly
   - Else → sort by first date field DESC:
     - created_at > updated_at > date > timestamp > inserted_at > modified_at
     - Fallback: id or _id DESC
   - Apply **first**, before any processing.

3. **PRESERVE ALL ROWS** unless configuration.filters or groupBy.

4. **OUTPUT STRUCTURE (DISCRIMINATED UNION)**:
   - If returnType === "scalar" → { "value": <number|string|boolean> }
   - If returnType === "object" → { "rows": [ <one object> ] }
   - If returnType === "array" → { "rows": [ <multiple objects> ] }
   - If empty → { "rows": [], "comment": "Aucun résultat." }

   → **NEVER mix value and rows**

5. **ENRICH EACH ROW**:
   - Add mira_note: 1 short fact (≤6 words)
     - "Most recent", "Only record", "No date", etc.
     - Omit if irrelevant.

6. **GENERATE comment**:
   - 1 sentence only (≤120 chars)
   - Same language as question
   - Format: "X [items] found. [Key fact]."

7. **INCLUDE meta**:
   {
     "default_ordering": "by created_at descending",
     "configuration": { ...user config... },
     "filters_applied": [],
     "query_complexity": "low"|"medium"|"high",
     "data_freshness": "real-time",
     "presentation_format": "table"|"list"|"single"|"empty"
   }

Return **exactly one JSON object**. Be **100% consistent** for same input + config.`,
    userPromptTemplate: `Data: {data}
Question: {question}
Configuration: {configuration}`,
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
};
