// Score queue: velocity-flagged projects + projects whose adoption has earned
// a review-gated level they haven't been signed off for yet.
import { desc, eq, or, sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { ECONOMY, levelFor } from '$lib/config/economy';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const reviewGateMin = Math.min(...ECONOMY.levels.filter((l) => l.requiresReview).map((l) => l.minScore));

	const rows = await db()
		.select({
			id: schema.projects.id,
			title: schema.projects.title,
			level: schema.projects.level,
			score: schema.projects.score,
			scoreFlagged: schema.projects.scoreFlagged,
			maxReviewedLevel: schema.projects.maxReviewedLevel,
			ownerEmail: schema.users.email
		})
		.from(schema.projects)
		.innerJoin(schema.users, eq(schema.projects.userId, schema.users.id))
		.where(or(eq(schema.projects.scoreFlagged, true), sql`${schema.projects.score} >= ${reviewGateMin}`))
		.orderBy(desc(schema.projects.score))
		.limit(100);

	return {
		queue: rows.map((r) => ({
			...r,
			earnedLevel: levelFor(r.score).level,
			needsSignoff: levelFor(r.score).level > r.maxReviewedLevel
		}))
	};
};
