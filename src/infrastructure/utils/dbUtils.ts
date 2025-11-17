export type DatabaseType = 'postgres' | 'mongodb';

export function inferDbTypeFromConnectionString(connectionString: string): DatabaseType {
  if (connectionString.includes('postgres')) return 'postgres';
  if (connectionString.includes('mongodb')) return 'mongodb';
  throw new Error('Unsupported or unknown database type. Connection string must contain either "postgres" or "mongodb"');
}
