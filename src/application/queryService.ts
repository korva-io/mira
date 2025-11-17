import { err, ok, Result } from 'neverthrow';
import { QueryInput } from '../api/schemas';
import {
  QueryError,
  QueryResult,
  QueryResultType,
  QueryMetadata,
  MiraNotes,
} from '../domain/types';
import { AiService, CacheService, DatabaseRepository, Logger } from '../infrastructure/interfaces';
import { SchemaExtractor } from '../infrastructure/database/schemaExtractor';
import { inferDbTypeFromConnectionString } from '../infrastructure/utils/dbUtils';

export class QueryService {
  private readonly schemaExtractor: SchemaExtractor;

  constructor(
    private readonly postgresRepo: DatabaseRepository,
    private readonly mongoRepo: DatabaseRepository,
    private readonly cache: CacheService,
    private readonly ai: AiService,
    private readonly logger: Logger
  ) {
    this.schemaExtractor = new SchemaExtractor();
  }

  async executeQuery(input: QueryInput): Promise<QueryResultType> {
    try {
      // Détecter automatiquement le type de base de données
      const dbType = input.connectionString.includes('postgres') ? 'postgres' : 'mongodb';
      
      // Check cache first
      const cacheKey = `${input.userId}:${input.nlQuery}:${input.connectionString}`;
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        return ok(JSON.parse(cachedResult) as QueryResult);
      }
      
      // Extract database schema first
      const schemaResult = await this.schemaExtractor.extractSchema(
        input.connectionString
      );
      if (schemaResult.isErr()) {
        return err(schemaResult.error);
      }

      // Translate natural language to query using the schema
      const translationResult = await this.ai.translateToQuery(
        input.nlQuery,
        input.connectionString,
        schemaResult.value
      );
      if (translationResult.isErr()) {
        return err(translationResult.error);
      }

      // Select repository based on detected database type
      const repo = dbType === 'postgres' ? this.postgresRepo : this.mongoRepo;
      // Remplace tout le bloc d'extraction
      const queryObjRaw = Array.isArray(translationResult.value.data)
        ? translationResult.value.data[0]
        : undefined;
      if (!queryObjRaw || typeof queryObjRaw['query'] !== 'string') {
        return err({
          message: "Format de requête invalide depuis l'IA",
          code: 'INVALID_QUERY_FORMAT',
        });
      }

      let queryString: string;
      try {
        const parsed = JSON.parse(queryObjRaw['query']);
        queryString =
          typeof parsed === 'object' && parsed?.query ? String(parsed.query).trim() : '';
      } catch {
        queryString = queryObjRaw['query'].trim();
      }

      if (!queryString) {
        return err({ message: 'Requête SQL vide', code: 'EMPTY_QUERY' });
      }

      const queryToExecute = queryString;
      if (!queryToExecute) {
        return err({
          message: 'No query generated from translation',
          code: 'QUERY_GENERATION_ERROR',
        });
      }
      const t0 = Date.now();
      const execPromise = repo.executeQuery(queryToExecute, input.connectionString);

      const executionResult = input.configuration?.timeout
        ? await Promise.race([
            execPromise,
            new Promise<Result<unknown[], QueryError>>((resolve) =>
              setTimeout(
                () =>
                  resolve(
                    err({
                      message: `Query timeout after ${input.configuration?.timeout}ms`,
                      code: 'QUERY_TIMEOUT',
                    })
                  ),
                input.configuration!.timeout!
              )
            ),
          ])
        : await execPromise;

      if (executionResult.isErr()) {
        return err(executionResult.error);
      }

      const rawData = executionResult.value;

      // 4. ANALYSE + FORMATAGE avec les nouveaux prompts
      const formatResult = await this.ai.analyzeAndFormat(
        JSON.stringify(rawData),
        input.nlQuery,
        input.configuration || {}
      );
      let analysis: Record<string, unknown> = { rows: rawData };
      let comment = 'Résultat brut sans analyse.';

      if (formatResult.isOk()) {
        try {
          const resultValue = formatResult.value;
          if (typeof resultValue === 'string') {
            analysis = JSON.parse(resultValue);
          } else {
            analysis = resultValue as Record<string, unknown>;
          }
          comment = (analysis['comment'] as string) || comment;
          console.log("analysis comment ", analysis['comment'])
        } catch (e) {
          console.log('Failed to parse AI analysis/format', { error: e });
        }
      }

      // Après le parsing de l’analyse IA
      let finalData: any = rawData; // fallback
      if (formatResult.isOk()) {
        try {
          const parsed = typeof formatResult.value === 'string' ? JSON.parse(formatResult.value) : formatResult.value;
          if (Array.isArray(parsed.rows)) {
            finalData = parsed.rows;
          } else if (typeof parsed.value !== 'undefined') {
            finalData = parsed.value;
          }
          // On peut aussi extraire meta/comment ici si besoin
          comment = (parsed.comment as string) || comment;
        } catch (e) {
          console.log('Failed to parse AI format', { error: e });
        }
      }

      // 5. Déterminer le type de résultat et construire les métadonnées
      const isArray = Array.isArray(finalData);
      const isCount =
        typeof finalData === 'number' ||
        (isArray &&
          finalData.length === 1 &&
          Object.keys(finalData[0] || {}).some(
            (key) => key.toLowerCase().includes('count') || key.toLowerCase().includes('total')
          ));

      const resultType = isCount
        ? 'count'
        : isArray && finalData.length > 1
          ? 'list'
          : isArray && finalData.length === 1
            ? 'single'
            : 'aggregation';

      // Normalisation des données et application de la configuration
      const cfg = input.configuration || {};

      let rows: Record<string, unknown>[] = [];
      let countValue: number | null = null;
      if (isCount) {
        if (
          Array.isArray(finalData) &&
          finalData.length === 1 &&
          typeof finalData[0] === 'object' &&
          finalData[0] !== null &&
          'count' in finalData[0]
        ) {
          countValue = Number((finalData[0] as any)['count']);
        } else if (typeof finalData === 'number') {
          countValue = finalData;
        } else {
          countValue = Number(finalData);
        }
      } else if (Array.isArray(finalData)) {
        if (finalData.length && typeof finalData[0] !== 'object') {
          rows = (finalData as unknown[]).map((v) => ({ value: v as unknown }));
        } else {
          rows = finalData as unknown as Record<string, unknown>[];
        }
      } else {
        rows = [{ value: finalData as unknown }];
      }

      if (!isCount && cfg.outputKeyFormat && cfg.outputKeyFormat !== 'original') {
        rows = rows.map((r) =>
          this.transformKeys(
            r,
            cfg.outputKeyFormat as
              | 'camelCase'
              | 'snake_case'
              | 'PascalCase'
              | 'kebab-case'
              | 'original'
          )
        );
      }

      // Apply filters
      if (!isCount) {
        if (Array.isArray((cfg as any).filters) && (cfg as any).filters.length) {
          rows = this.applyFilters(
            rows,
            (cfg as any).filters as Array<{ field: string; operator?: string; value: any }>
          );
        }
        // Apply sorting
        if ((cfg as any).sort && (cfg as any).sort.field) {
          const order = ((cfg as any).sort.order as 'asc' | 'desc') || 'desc';
          rows = this.applySort(rows, (cfg as any).sort.field as string, order);
        }
        if (cfg.maxResults && Array.isArray(rows)) {
          rows = rows.slice(0, cfg.maxResults);
        }
      }

      const execMs = Date.now() - t0;
      // 6. Construire le résultat final avec la nouvelle structure
      const miraNotes = {
        comment,
        queryIntent: input.nlQuery,
        context: {
          userQuery: input.nlQuery,
          interpretedAs: `Requête ${dbType} exécutée avec succès`,
        },
        dataInsights: isCount
          ? `Valeur de comptage : ${countValue}`
          : Array.isArray(rows)
            ? `Résultat contient ${rows.length} enregistrement(s)`
            : `Résultat scalaire de type ${typeof finalData}`,
        suggestions: [
          ...(input.configuration?.maxResults &&
          Array.isArray(rows) &&
          rows.length >= input.configuration.maxResults
            ? ['Résultat potentiellement tronqué, considérez augmenter maxResults']
            : []),
          ...(queryToExecute.includes('SELECT *')
            ? ['Considérez spécifier les colonnes exactes au lieu de SELECT *']
            : []),
        ],
      };

      let result: QueryResult;
      if (isCount && countValue !== null) {
        result = {
          data: countValue,
          comment,
          metadata: {
            executionTime: execMs,
            queryType: dbType,
            timestamp: new Date().toISOString(),
            resultType,
            totalCount: 1,
            sqlQuery: queryToExecute,
            queryComplexity:
              queryToExecute.length > 200
                ? 'high'
                : queryToExecute.includes('JOIN')
                  ? 'medium'
                  : 'low',
            dataFreshness: 'real-time',
          },
          ___miraNotes: miraNotes,
        };
      } else {
        result = {
          data: rows,
          comment,
          metadata: {
            executionTime: execMs,
            queryType: dbType,
            timestamp: new Date().toISOString(),
            resultType,
            totalCount: Array.isArray(rows) ? rows.length : undefined,
            sqlQuery: queryToExecute,
            queryComplexity:
              queryToExecute.length > 200
                ? 'high'
                : queryToExecute.includes('JOIN')
                  ? 'medium'
                  : 'low',
            dataFreshness: 'real-time',
          },
          ___miraNotes: miraNotes,
        };
      }

      // Cache successful results
      await this.cache.set(cacheKey, JSON.stringify(result), 3600); // Cache for 1 hour

      // // Log the query
      // await this.logger.logQuery({
      //   userId: input.userId,
      //   nlQuery: input.nlQuery,
      //   dbType: input.dbType,
      //   result: ok(result),
      // });

      return ok(result);
    } catch (error) {
      return err({
        message: 'Failed to execute query',
        code: 'QUERY_EXECUTION_ERROR',
        details: error,
      } as QueryError);
    }
  }

  async generateSchemaInsights(
    failedQueries: string[],
    connectionString: string,
  ): Promise<Result<string, QueryError>> {
    try {
      // Détecter automatiquement le type de base de données
      const dbType = inferDbTypeFromConnectionString(connectionString);
      
      // Extract schema first
      const schemaResult = await this.schemaExtractor.extractSchema(
        connectionString      );
      if (schemaResult.isErr()) {
        return err({
          code: 'SCHEMA_EXTRACTION_FAILED',
          message: schemaResult.error.message,
        });
      }

      // Generate insights using AI
      const prompt = `Given the following database schema (${dbType}):\n${JSON.stringify(schemaResult.value, null, 2)}\n\nAnd these failed queries:\n${failedQueries.join('\n')}\n\nProvide insights on how to improve the schema to better support these queries.`;

      const insightsResult = await this.ai.translateToQuery(prompt, dbType, schemaResult.value);
      if (insightsResult.isErr()) {
        return err({
          code: 'INSIGHTS_GENERATION_FAILED',
          message: insightsResult.error.message,
        });
      }

      return ok(JSON.stringify(insightsResult.value));
    } catch (error) {
      return err({
        code: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  }
}

// Helper methods
export interface KeyFormatOptions {
  format: 'camelCase' | 'snake_case' | 'PascalCase' | 'kebab-case' | 'original';
}

// Methods below are part of QueryService class in runtime via prototype, but
// TypeScript treats them as private using declaration merging technique
export interface QueryService {
  transformKeys<T = Record<string, unknown>>(
    obj: any,
    format: 'camelCase' | 'snake_case' | 'PascalCase' | 'kebab-case' | 'original'
  ): T;
  formatKey(key: string, format: KeyFormatOptions['format']): string;
  toCamel(input: string): string;
  toPascal(input: string): string;
  toSnake(input: string): string;
  toKebab(input: string): string;
  applyFilters(
    rows: Record<string, unknown>[],
    filters: Array<{ field: string; operator?: string; value: any }>
  ): Record<string, unknown>[];
  applySort(
    rows: Record<string, unknown>[],
    field: string,
    order: 'asc' | 'desc'
  ): Record<string, unknown>[];
}

QueryService.prototype.transformKeys = function transformKeys(
  this: QueryService,
  obj: any,
  format: 'camelCase' | 'snake_case' | 'PascalCase' | 'kebab-case' | 'original'
): any {
  if (Array.isArray(obj)) return obj.map((v) => this.transformKeys(v, format));
  if (obj && typeof obj === 'object') {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      const nk = this.formatKey(k, format);
      res[nk] = this.transformKeys(v, format);
    }
    return res;
  }
  return obj;
};

QueryService.prototype.formatKey = function formatKey(
  this: QueryService,
  key: string,
  format: KeyFormatOptions['format']
): string {
  switch (format) {
    case 'camelCase':
      return this.toCamel(key);
    case 'snake_case':
      return this.toSnake(key);
    case 'PascalCase':
      return this.toPascal(key);
    case 'kebab-case':
      return this.toKebab(key);
    default:
      return key;
  }
};

function splitWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-\s]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

QueryService.prototype.toCamel = function toCamel(this: QueryService, input: string): string {
  const words = splitWords(input);
  return words.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('');
};

QueryService.prototype.toPascal = function toPascal(this: QueryService, input: string): string {
  const words = splitWords(input);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
};

QueryService.prototype.toSnake = function toSnake(this: QueryService, input: string): string {
  const words = splitWords(input);
  return words.join('_');
};

QueryService.prototype.toKebab = function toKebab(this: QueryService, input: string): string {
  const words = splitWords(input);
  return words.join('-');
};

QueryService.prototype.applyFilters = function applyFilters(
  this: QueryService,
  rows: Record<string, unknown>[],
  filters: Array<{ field: string; operator?: string; value: any }>
): Record<string, unknown>[] {
  const ops: Record<string, (a: any, b: any) => boolean> = {
    eq: (a, b) => a === b,
    neq: (a, b) => a !== b,
    gt: (a, b) => Number(a) > Number(b),
    lt: (a, b) => Number(a) < Number(b),
    gte: (a, b) => Number(a) >= Number(b),
    lte: (a, b) => Number(a) <= Number(b),
    in: (a, b) => Array.isArray(b) && b.includes(a),
    like: (a, b) =>
      String(a ?? '')
        .toLowerCase()
        .includes(String(b ?? '').toLowerCase()),
  };

  return rows.filter((row) =>
    filters.every((f) => {
      const key = (f.operator ?? 'eq') as keyof typeof ops;
      const op = (ops[key] ?? ops['eq']) as (a: any, b: any) => boolean;
      const val = (row as any)[f.field];
      return op(val, f.value);
    })
  );
};

QueryService.prototype.applySort = function applySort(
  this: QueryService,
  rows: Record<string, unknown>[],
  field: string,
  order: 'asc' | 'desc'
): Record<string, unknown>[] {
  const dir = order === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = (a as any)[field];
    const bv = (b as any)[field];
    if (av == null && bv == null) return 0;
    if (av == null) return -1 * dir;
    if (bv == null) return 1 * dir;
    const an = Number(av);
    const bn = Number(bv);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
};
