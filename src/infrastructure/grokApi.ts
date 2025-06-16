import { Result, err, ok } from 'neverthrow';
import { AiService } from './interfaces';
import { QueryError, QueryResult } from '../domain/types';

export class GrokApi implements AiService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.GROK_API_KEY || '';
    this.baseUrl = process.env.GROK_API_URL || 'https://api.grok.ai/v1';
  }

  async translateToQuery(
    nlQuery: string,
    dbType: string
  ): Promise<Result<QueryResult, QueryError>> {
    try {
      const response = await fetch(`${this.baseUrl}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query: nlQuery,
          dbType,
        }),
      });

      if (!response.ok) {
        throw new Error(`Grok API error: ${response.statusText}`);
      }

      const data = await response.json();
      return ok({
        data: [data],
        metadata: {
          model: 'grok-1',
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
}
