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
    this.baseUrl = process.env['GROK_API_URL'] || 'https://api.x.ai/grok/v1';
  }

  private async makeRequest(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    temperature = 0.0, // ← Déterminisme
    maxTokens = 4096 // ← Plus de marge
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
          max_tokens: maxTokens,
          response_format: { type: 'json_object' }, // ← FORCER JSON
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return err({
          message: `Grok API error: ${response.statusText}`,
          code: 'GROK_API_ERROR',
          details: `HTTP ${response.status}: ${errorText}`,
        });
      }

      const data = (await response.json()) as GrokResponse;
      return ok(data);
    } catch (error: any) {
      return err({
        message: 'Failed to communicate with Grok API',
        code: 'GROK_API_ERROR',
        details: error.message || error,
      });
    }
  }

  // Supporte les objets dans les placeholders
  private formatPrompt(template: string, params: Record<string, string | object>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      const value = params[key];
      if (value === undefined) return '';
      return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    });
  }

  private async callPrompt(
    promptName: PromptName,
    params: Record<string, string | object>
  ): Promise<Result<string, QueryError>> {
    const config = PROMPT_CONFIGS[promptName];
    const userPrompt = this.formatPrompt(config.userPromptTemplate, params);

    const result = await this.makeRequest([
      { role: 'system', content: config.systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return result.andThen((response: GrokResponse) => {
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return err({ message: 'Empty response from AI', code: 'AI_EMPTY_RESPONSE' });
      }
      return ok(content.trim());
    });
  }

  async translateToQuery(
    nlQuery: string,
    dbType: string,
    schema?: string
  ): Promise<Result<QueryResult, QueryError>> {
    try {
      const schemaToUse = schema || JSON.stringify({ type: dbType });

      const queryResult = await this.callPrompt(PromptName.QUERY_BUILDER, {
        nlQuery,
        schema: schemaToUse,
      });

      console.log("api query result ", queryResult);

      if (queryResult.isErr()) {
        return err({
          message: 'Failed to generate query',
          code: 'QUERY_GENERATION_FAILED',
          details: queryResult.error,
        });
      }

      // RETOURNE UNIQUEMENT LA REQUÊTE SQL COMME CHAÎNE
      return ok({
        data: [{ query: queryResult.value.trim() }], // ← SQL pur
        metadata: {
          executionTime: 0, // Adding the required executionTime property
          model: 'grok-3-mini',
          queryType: dbType,
          timestamp: new Date().toISOString(),
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

  async extractSchema(connectionString: string): Promise<Result<string, QueryError>> {
    // Extract database name from connection string
    let databaseName = 'unknown';
    try {
      if (connectionString.includes('mongodb')) {
        const match = connectionString.match(/\/([^/?]+)(\?|$)/);
        databaseName = (match && match[1]) || 'mongodb_database';
      } else if (connectionString.includes('postgres')) {
        const match = connectionString.match(/\/([^/?]+)(\?|$)/);
        databaseName = (match && match[1]) || 'postgres_database';
      }
    } catch (e) {
      // Use default if parsing fails
    }

    return this.callPrompt(PromptName.SCHEMA_EXPLORER, {
      databaseName,
    });
  }

  async generateQuery(nlQuery: string, schema: string): Promise<Result<string, QueryError>> {
    return this.callPrompt(PromptName.QUERY_BUILDER, {
      nlQuery,
      schema,
    });
  }

  async analyzeData(
    data: string,
    question: string,
    configuration: Record<string, unknown> = {}
  ): Promise<Result<string, QueryError>> {
    return this.callPrompt(PromptName.DATA_ANALYZER, {
      data,
      question,
      configuration,
    });
  }
}
