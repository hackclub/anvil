// Job health: Airtable sync dead-letters + erroring traction sources.
import { desc, eq, gt } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const syncs = await db()
		.select({
			id: schema.airtableSyncs.id,
			status: schema.airtableSyncs.status,
			attempts: schema.airtableSyncs.attempts,
			lastError: schema.airtableSyncs.lastError,
			airtableRecordId: schema.airtableSyncs.airtableRecordId,
			createdAt: schema.airtableSyncs.createdAt,
			projectTitle: schema.projects.title
		})
		.from(schema.airtableSyncs)
		.innerJoin(schema.projects, eq(schema.airtableSyncs.projectId, schema.projects.id))
		.orderBy(desc(schema.airtableSyncs.createdAt))
		.limit(100);

	const erroringSources = await db()
		.select({
			id: schema.tractionSources.id,
			kind: schema.tractionSources.kind,
			externalRef: schema.tractionSources.externalRef,
			errorCount: schema.tractionSources.errorCount,
			lastPolledAt: schema.tractionSources.lastPolledAt,
			projectTitle: schema.projects.title
		})
		.from(schema.tractionSources)
		.innerJoin(schema.projects, eq(schema.tractionSources.projectId, schema.projects.id))
		.where(gt(schema.tractionSources.errorCount, 2))
		.orderBy(desc(schema.tractionSources.errorCount))
		.limit(50);

	return {
		syncs: syncs.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
		erroringSources: erroringSources.map((s) => ({
			...s,
			lastPolledAt: s.lastPolledAt?.toISOString() ?? null
		}))
	};
};
