// Unified YSWS DB sync (Airtable): every approved ship becomes one record.
// PII (names/address/birthday) is fetched LIVE from HCA at sync time - we
// hold none of it at rest. A dead token throws, so the job retries and
// eventually dead-letters visibly in /admin/jobs.
import { eq } from 'drizzle-orm';
import { createLogger } from '$lib/log';
import { db, schema } from '../db';
import { fetchLiveProfile } from '../auth/hca';
import { enqueue } from '../jobs';
import { flag, optional, required } from '../env';

const log = createLogger('airtable');

export async function queueAirtableSync(projectId: number, shipId: number, reviewId?: string): Promise<void> {
	await db().insert(schema.airtableSyncs).values({ projectId, shipId, reviewId }).onConflictDoNothing();

	try {
		// singletonKey dedupes: if a sync for this ship is already queued/running,
		// pg-boss drops the duplicate so we can't POST two Airtable records for
		// one ship (the sweeper re-enqueues in-flight rows, racing this path)
		await enqueue('airtable.sync', { shipId }, { singletonKey: `airtable-sync-${shipId}` });
		log.info('sync queued', { projectId, shipId, reviewId: reviewId ?? null });
	} catch (err) {
		// the hourly sweeper picks up pending rows anyway
		log.warn('enqueue failed (row saved as pending)', { err, capture: false, shipId });
	}
}

function githubUsername(repoUrl: string | null): string {
	const m = repoUrl?.match(/github\.com\/([^/]+)/i);
	return m ? m[1] : '';
}

/** Build the Unified YSWS DB record for an approved ship. */
export async function buildRecord(shipId: number): Promise<Record<string, unknown> | null> {
	const [row] = await db()
		.select()
		.from(schema.ships)
		.innerJoin(schema.projects, eq(schema.ships.projectId, schema.projects.id))
		.innerJoin(schema.users, eq(schema.ships.userId, schema.users.id))
		.where(eq(schema.ships.id, shipId));

	if (!row || row.ships.status !== 'approved') return null;

	// prettier-ignore
	const [sync] = await db()
		.select()
		.from(schema.airtableSyncs)
		.where(eq(schema.airtableSyncs.shipId, shipId));

	const [review] = sync?.reviewId
		? // prettier-ignore
			await db()
				.select()
				.from(schema.reviews)
				.where(eq(schema.reviews.id, sync.reviewId))
		: [];

	const u = row.users;
	const s = row.ships;
	const hours = s.hoursAssigned ?? Math.round((s.secondsSubmitted / 3600) * 100) / 100;
	const p = await fetchLiveProfile(u); // PII lives in HCA, not our DB

	// NOTE: field names must match the Unified YSWS DB columns exactly -
	// adjust here if the base schema drifts.
	return {
		'First Name': p.firstName ?? p.legalFirstName ?? '',
		'Last Name': p.lastName ?? p.legalLastName ?? '',
		Email: u.email,
		'GitHub Username': githubUsername(s.snapRepoUrl),
		'Address (Line 1)': p.addressLine1 ?? '',
		'Address (Line 2)': p.addressLine2 ?? '',
		City: p.addressCity ?? '',
		'State / Province': p.addressState ?? '',
		Country: p.addressCountry ?? '',
		'ZIP / Postal Code': p.addressPostalCode ?? '',
		Birthday: p.birthday ?? '',
		Description: s.snapDescription,
		'Code URL': s.snapRepoUrl ?? '',
		'Playable URL': s.snapDemoUrl ?? '',
		'Optional - Override Hours Spent': hours,
		'Optional - Override Hours Spent Justification': review?.justification ?? '',
		...(s.snapScreenshotUrl?.startsWith('http') ? { Screenshot: [{ url: s.snapScreenshotUrl }] } : {})
	};
}

/** Perform the sync for one ship. Returns the created record id. */
export async function syncShipToAirtable(shipId: number): Promise<string | 'dry-run' | null> {
	const fields = await buildRecord(shipId);
	if (!fields) return null;

	if (!flag('AIRTABLE_ENABLED')) {
		// PII is in `fields` - log only that a dry-run happened, never the payload.
		log.info('dry-run (AIRTABLE_ENABLED=0), skipping create', { shipId });
		return 'dry-run';
	}

	const baseId = required('AIRTABLE_BASE_ID');
	const table = optional('AIRTABLE_TABLE', 'YSWS Project Submission');
	log.debug('creating record', { shipId, table });
	const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${required('AIRTABLE_API_KEY')}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ fields, typecast: true })
	});

	if (!res.ok) {
		throw new Error(`airtable create failed: ${res.status} ${await res.text()}`);
	}

	const body = (await res.json()) as { id: string };
	return body.id;
}
