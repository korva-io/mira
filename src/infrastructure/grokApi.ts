import { Result, err, ok } from 'neverthrow';
import { AiService } from './interfaces';
import { QueryError, QueryResult } from '../domain/types';
import { PROMPT_CONFIGS, PromptName } from './utils/prompts';

interface GrokResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class GrokApi implements AiService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env['GROK_API_KEY'] || '';
    this.baseUrl = process.env['GROK_API_URL'] || 'https://api.x.ai/v1';
  }

  private async makeRequest(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    temperature = 0.7,
    maxTokens = 2000
  ): Promise<Result<GrokResponse, QueryError>> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'grok-3-mini',
          messages,
          temperature,
          // max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        return err({
          message: `Grok API error: ${response.statusText}`,
          code: 'GROK_API_ERROR',
          details: `HTTP ${response.status}`,
        });
      }

      const data = (await response.json()) as GrokResponse;
      return ok(data);
    } catch (error) {
      return err({
        message: 'Failed to communicate with Grok API',
        code: 'GROK_API_ERROR',
        details: error,
      });
    }
  }

  private formatPrompt(template: string, params: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => params[key as keyof typeof params] || '');
  }

  private async callPrompt(
    promptName: PromptName,
    params: Record<string, string>
  ): Promise<Result<string, QueryError>> {
    const config = PROMPT_CONFIGS[promptName];
    const userPrompt = this.formatPrompt(config.userPromptTemplate, params);

    const result = await this.makeRequest([
      { role: 'system', content: config.systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return result.map((response) => {
      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new Error('No content in response');
      }
      return content;
    });
  }

  async translateToQuery(
    nlQuery: string,
    dbType: string
  ): Promise<Result<QueryResult, QueryError>> {
    try {
      // First, extract the database schema
      const schemaResult = await this.callPrompt(PromptName.SCHEMA_EXPLORER, {
        databaseName: dbType,
      });

      if (schemaResult.isErr()) {
        return err({
          message: 'Failed to extract schema',
          code: 'SCHEMA_EXTRACTION_FAILED',
          details: schemaResult.error,
        });
      }

      // Generate the query using the schema
      const queryResult = await this.callPrompt(PromptName.QUERY_BUILDER, {
        nlQuery,
        schema: schemaResult.value,
      });
      if (queryResult.isErr()) {
        return err({
          message: 'Failed to generate query',
          code: 'QUERY_GENERATION_FAILED',
          details: queryResult.error,
        });
      }

      // Analyze the generated query
      const analysisResult = await this.callPrompt(PromptName.DATA_ANALYZER, {
        data: queryResult.value,
        question: nlQuery,
      });
      if (analysisResult.isErr()) {
        return err({
          message: 'Failed to analyze query',
          code: 'QUERY_ANALYSIS_FAILED',
          details: analysisResult.error,
        });
      }

      const now = new Date();
      const analysis = JSON.parse(analysisResult.value) as Record<string, unknown>;

      return ok({
        data: [
          {
            query: queryResult.value,
            analysis,
          },
        ],
        metadata: {
          model: 'grok-1',
          schema: schemaResult.value,
          executionTime: 0, // This should be calculated based on actual execution time
          queryType: dbType,
          timestamp: now.toISOString(),
        },
      });
    } catch (error) {
      return err({
        message: 'Failed to translate query',
        code: 'GROK_API_ERROR',
        details: error,
      });
    }
  }

  async generateSchemaInsights(
    failedQueries: string[],
    schema: string
  ): Promise<Result<string, QueryError>> {
    return this.callPrompt(PromptName.INSIGHT_ENGINE, {
      failedQueries: JSON.stringify(failedQueries),
      schema,
    });
  }

  async analyzeMongoDBCollectionStructure(
    collections: Record<string, unknown>[]
  ): Promise<Result<string, QueryError>> {
    const result = await this.callPrompt(PromptName.MONGODB_COLLECTION_STRUCTURE, {
      collections: JSON.stringify(collections),
    });

    if (result.isErr()) {
      return err({
        message: 'Failed to analyze query',
        code: 'QUERY_ANALYSIS_FAILED',
        details: result.error,
      });
    }

    return JSON.parse(result.value) as Record<string, unknown>;
  }

  async analyzeMongoDBDistinctFields(collections: Record<string, unknown>[]): Promise<string[]> {
    const result = await this.callPrompt(PromptName.MONGODB_DISTINCT_FIELDS, {
      collections: JSON.stringify(collections),
    });

    if (result.isErr()) {
      console.error('Failed to analyze distinct fields: ', result.error);
      return [];
    }

    return JSON.parse(result.value) as string[];
  }
}
