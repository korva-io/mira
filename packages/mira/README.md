# @korva/mira

Official client SDK for Mira - Transform natural language into database queries.

## Installation

```bash
npm install @korva/mira
```

## Usage

```typescript
import { Mira } from '@korva/mira';

const mira = new Mira('your-api-key');

const result = await mira.query({
  dbType: 'postgres',
  connectionString: 'postgresql://user:pass@localhost:5432/db',
  nlQuery: 'Show me all active users',
  userId: 'user-123'
});

if (result.isOk()) {
  console.log('Query results:', result.value);
} else {
  console.error('Error:', result.error.message);
}
```

## API

### `new Mira(apiKey: string, baseUrl?: string)`

Create a new Mira client instance.

- `apiKey`: Your Mira API key
- `baseUrl`: Optional custom API endpoint (defaults to `https://api.korva.io`)

### `mira.query(input: QueryInput): Promise<Result<any[], AppError>>`

Execute a natural language query against your database.

**Input:**
- `dbType`: Database type (`'postgres'` or `'mongodb'`)
- `connectionString`: Database connection string
- `nlQuery`: Natural language query
- `userId`: User identifier for tracking

**Returns:** A `Result` type from `neverthrow` containing either:
- Success: Array of query results
- Error: `AppError` with code and message

## Error Handling

The SDK uses `neverthrow` for functional error handling:

```typescript
const result = await mira.query(input);

result.match(
  (data) => console.log('Success:', data),
  (error) => console.error(`Error [${error.code}]:`, error.message)
);
```

## License

MIT © Korva
