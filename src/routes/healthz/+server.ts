// Coolify healthcheck: verifies the server AND its database connection.
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { createLogger } from '$lib/log';
import type { RequestHandler } from './$types';

const log = createLogger('healthz');

export const GET: RequestHandler = async () => {
	try {
		await db().execute(sql`select 1`);
		return json({ ok: true });
	} catch (err) {
		log.error('healthcheck failed: database unreachable', { err });
		return json({ ok: false, error: 'database unreachable' }, { status: 503 });
	}
};
