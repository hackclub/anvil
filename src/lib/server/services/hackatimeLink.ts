// Automatic Hackatime account linking. Resolution chain:
// 1. public /users/{slack_uid}/stats -> data.{user_id, username}  (no key)
// 2. public /users/{hca_id}/stats    -> same (hackatime resolves HCA ids)
// 3. stats-key lookups by slack uid / email (work when HACKATIME_ADMIN_KEY is
//    hackatime's shared STATS_API_KEY rather than a personal hka_ key)
// Also backfills the slack username - the platform's primary display name.
// Called best-effort on login and on demand from the project page.
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { User } from '../db/schema';
import { getStatsProfile, lookupByEmail, lookupBySlackUid } from './hackatime';

export async function ensureHackatimeLinked(user: User): Promise<string | null> {
	if (user.hackatimeId && user.username) return user.hackatimeId;

	let profile: { id: string; username: string | null } | null = null;
	if (user.slackId) {
		profile = await getStatsProfile(user.slackId);
	}

	if (!profile) {
		profile = await getStatsProfile(user.hcaId);
	}

	if (!profile && user.hackatimeId) {
		profile = await getStatsProfile(user.hackatimeId);
	}

	if (!profile) {
		let id: string | null = null;
		if (user.slackId) {
			id = await lookupBySlackUid(user.slackId);
		}

		if (!id) {
			id = await lookupByEmail(user.email);
		}

		if (id) {
			profile = { id, username: null };
		}
	}

	if (!profile) return user.hackatimeId ?? null;

	await db()
		.update(schema.users)
		.set({
			hackatimeId: profile.id,
			...(profile.username && !user.username ? { username: profile.username } : {})
		})
		.where(eq(schema.users.id, user.id));

	return profile.id;
}
