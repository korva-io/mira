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
          max_tokens: maxTokens,
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

    return result.map((response: GrokResponse) => {
      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new Error('No content in response');
      }
      return content;
    });
  }

  async translateToQuery(
    nlQuery: string,
    dbType: string,
    schema?: string
  ): Promise<Result<QueryResult, QueryError>> {
    try {
      // Use provided schema or generate a simple one
      const schemaToUse = schema || JSON.stringify({ type: dbType, note: 'No schema provided' });

      // Generate the query using the schema
      const queryResult = await this.callPrompt(PromptName.QUERY_BUILDER, {
        nlQuery,
        schema: schemaToUse,
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
          model: 'grok-3-mini',
          schema: schemaToUse,
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

  async analyzeData(data: string, question: string): Promise<Result<string, QueryError>> {
    return this.callPrompt(PromptName.DATA_ANALYZER, {
      data,
      question,
    });
  }
}
