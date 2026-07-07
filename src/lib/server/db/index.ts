// Drizzle client over postgres.js. The connection is lazy - nothing touches
// the network until the first query, so prerendering the marketing pages
// works without a database.
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { required } from '../env';
import * as schema from './schema';

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
	if (!_db) {
		_client = postgres(required('DATABASE_URL'), { max: 10 });
		_db = drizzle(_client, { schema });
	}

	return _db;
}

export { schema };
