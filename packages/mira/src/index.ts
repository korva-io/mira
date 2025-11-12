import axios from 'axios';
import { z } from 'zod';
import { Result, ok, err } from 'neverthrow';

const QueryInputSchema = z.object({
  dbType: z.enum(['postgres', 'mongodb']),
  connectionString: z.string(),
  nlQuery: z.string(),
  userId: z.string(),
  configuration: z.object({
    outputKeyFormat: z.enum(['camelCase', 'snake_case', 'PascalCase', 'kebab-case', 'original']).optional(),
    maxResults: z.number().optional(),
    timeout: z.number().optional(),
  }).optional(), 
});

type QueryInput = z.infer<typeof QueryInputSchema>;

class AppError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export class Mira {
  constructor(
    private apiKey: string, 
    private baseUrl: string = 'http://localhost:4000/api/v1' // Change this to your deployed URL
  ) {}

  async query(input: QueryInput): Promise<Result<any[], AppError>> {
    const parseResult = QueryInputSchema.safeParse(input);
    if (!parseResult.success) {
      return err(new AppError('INVALID_INPUT', parseResult.error.message));
    }

    try {
      const response = await axios.post(`${this.baseUrl}/query`, parseResult.data, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      return ok(response.data.data);
    } catch (error: any) {
      const message = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to execute query';
      console.error('Mira API Error Details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      return err(new AppError('API_ERROR', message));
    }
  }
}

export { AppError, QueryInput };
