import { Result, err, ok } from 'neverthrow';
import { GrokApi, GrokApiError } from '../../infrastructure/utils/grokApi';
import { DatabaseRepository } from '../../infrastructure/interfaces';
import { QueryError, QueryResult } from '../../domain/types';

export class QueryService {
    constructor(
        private readonly grokApi: GrokApi,
        private readonly databaseRepository: DatabaseRepository,
    ) { }

    async translateAndExecuteQuery(
        nlQuery: string,
        dbType: string,
        connectionString: string,
    ): Promise<Result<QueryResult, QueryError>> {
        try {
            // First, extract the database schema
            const schemaResult = await this.grokApi.extractSchema(connectionString);
            if (schemaResult.isErr()) {
                return err({
                    code: 'SCHEMA_EXTRACTION_FAILED',
                    message: schemaResult.error.message,
                });
            }

            // Generate the query using the schema
            const queryResult = await this.grokApi.generateQuery(nlQuery, schemaResult.value);
            if (queryResult.isErr()) {
                return err({
                    code: 'QUERY_GENERATION_FAILED',
                    message: queryResult.error.message,
                });
            }

            // Execute the generated query
            const executionResult = await this.databaseRepository.executeQuery(
                queryResult.value,
                dbType,
                connectionString,
            );
            if (executionResult.isErr()) {
                return err({
                    code: 'QUERY_EXECUTION_FAILED',
                    message: executionResult.error.message,
                });
            }

            // Analyze the results
            const analysisResult = await this.grokApi.analyzeData(
                JSON.stringify(executionResult.value),
                nlQuery,
            );
            if (analysisResult.isErr()) {
                return err({
                    code: 'RESULT_ANALYSIS_FAILED',
                    message: analysisResult.error.message,
                });
            }

            return ok({
                query: queryResult.value,
                result: executionResult.value,
                analysis: JSON.parse(analysisResult.value),
            });
        } catch (error) {
            return err({
                code: 'UNEXPECTED_ERROR',
                message: error instanceof Error ? error.message : 'An unexpected error occurred',
            });
        }
    }

    async generateSchemaInsights(
        failedQueries: string[],
        connectionString: string,
    ): Promise<Result<string, QueryError>> {
        try {
            // Extract the current schema
            const schemaResult = await this.grokApi.extractSchema(connectionString);
            if (schemaResult.isErr()) {
                return err({
                    code: 'SCHEMA_EXTRACTION_FAILED',
                    message: schemaResult.error.message,
                });
            }

            // Generate insights
            const insightsResult = await this.grokApi.generateInsights(
                JSON.stringify(failedQueries),
                schemaResult.value,
            );
            if (insightsResult.isErr()) {
                return err({
                    code: 'INSIGHTS_GENERATION_FAILED',
                    message: insightsResult.error.message,
                });
            }

            return ok(insightsResult.value);
        } catch (error) {
            return err({
                code: 'UNEXPECTED_ERROR',
                message: error instanceof Error ? error.message : 'An unexpected error occurred',
            });
        }
    }
} 