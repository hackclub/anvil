// Unified YSWS DB sync worker + hourly sweeper for stragglers.
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { flag } from '../env';
import { syncShipToAirtable } from '../services/airtable';
import { enqueue, registerJob } from './index';

const MAX_ATTEMPTS = 8;

async function processSync(shipId: number): Promise<void> {
	// prettier-ignore
	const [sync] = await db()
		.select()
		.from(schema.airtableSyncs)
		.where(eq(schema.airtableSyncs.shipId, shipId));

	if (!sync || sync.status === 'synced') return;

	try {
		const recordId = await syncShipToAirtable(shipId);
		if (recordId === 'dry-run') return;

		// stays pending until AIRTABLE_ENABLED
		if (recordId === null) {
			await db()
				.update(schema.airtableSyncs)
				.set({ status: 'failed', lastError: 'ship missing or not approved' })
				.where(eq(schema.airtableSyncs.id, sync.id));

			return;
		}

		await db()
			.update(schema.airtableSyncs)
			.set({ status: 'synced', airtableRecordId: recordId, syncedAt: new Date(), lastError: null })
			.where(eq(schema.airtableSyncs.id, sync.id));
	} catch (err) {
		const attempts = sync.attempts + 1;
		await db()
			.update(schema.airtableSyncs)
			.set({
				attempts,
				lastError: String(err),
				// dead-letter after MAX_ATTEMPTS - visible in /admin/jobs
				status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'
			})
			.where(eq(schema.airtableSyncs.id, sync.id));

		throw err; // let pg-boss retry with backoff
	}
}

registerJob({
	queue: 'airtable.sync',
	handler: async (jobs) => {
		for (const job of jobs as { data: { shipId: number } }[]) {
			await processSync(job.data.shipId);
		}
	},
	options: { retryLimit: 4, retryDelay: 30, retryBackoff: true } as never
});

// hourly sweeper: re-enqueue pending rows (covers enqueue failures, restarts,
// and the moment AIRTABLE_ENABLED flips on)
registerJob({
	queue: 'airtable.sweep',
	cron: '15 * * * *',
	handler: async () => {
		if (!flag('AIRTABLE_ENABLED')) return;

		const rows = await db()
			.select({ shipId: schema.airtableSyncs.shipId })
			.from(schema.airtableSyncs)
			.where(
				and(
					inArray(schema.airtableSyncs.status, ['pending']),
					lt(schema.airtableSyncs.attempts, MAX_ATTEMPTS),
					sql`${schema.airtableSyncs.updatedAt} < now() - interval '10 minutes'`
				)
			)
			.limit(100);

		// same singletonKey as the direct-enqueue path: pg-boss won't queue a
		// second sync for a ship that already has one queued or running, so the
		// sweeper can't race the original into a duplicate Airtable record
		for (const r of rows)
			await enqueue('airtable.sync', { shipId: r.shipId }, { singletonKey: `airtable-sync-${r.shipId}` });
	}
});
