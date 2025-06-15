# Mira - AI-Powered Database Query Interpreter

Mira is a powerful API that translates natural language queries into SQL/MongoDB queries using AI. It provides a simple REST API endpoint that accepts natural language queries and returns database results.

## Features

- Natural language to SQL/MongoDB query translation
- Support for PostgreSQL and MongoDB databases
- REST API with OpenAPI/Swagger documentation
- Redis caching for improved performance
- MongoDB-based query logging
- TypeScript with strict type checking
- Docker support for easy deployment

## Prerequisites

- Node.js v20 or later
- Yarn package manager
- Redis server
- MongoDB server (for logging)
- Grok API key

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/mira.git
   cd mira
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Copy the example environment file and update it with your values:
   ```bash
   cp .env.example .env
   ```

4. Start the development server:
   ```bash
   yarn dev
   ```

The API will be available at `http://localhost:3000`, and the Swagger documentation at `http://localhost:3000/docs`.

## API Usage

Send a POST request to `/query` with the following JSON body:

```json
{
  "dbType": "postgres",
  "connectionString": "postgresql://user:pass@localhost/db",
  "nlQuery": "Show me all orders from last month",
  "userId": "user123"
}
```

## Development

- `yarn dev` - Start development server with hot reload
- `yarn build` - Build for production
- `yarn start` - Start production server
- `yarn test` - Run tests
- `yarn lint` - Run linter
- `yarn format` - Format code with Prettier

## License

MIT
