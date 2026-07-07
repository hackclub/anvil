// SCORE: adoption -> score -> level (high-water) -> retroactive top-ups.
// Weighed in star-equivalents (see config/economy.ts) - social is never
// scored; sharing pays one-time quest bounties instead (economy/quests.ts).
import { and, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { ECONOMY, levelFor } from '$lib/config/economy';
import { db, schema } from '../db';
import { computeTopups, type ApprovedShipEarn } from './topup';

export function scoreFor(sources: { kind: string; verified: boolean; lastValue: number | null }[]): number {
	let score = 0;
	for (const s of sources) {
		if (!s.verified || s.lastValue == null) continue;

		score += (ECONOMY.weights[s.kind] ?? 0) * s.lastValue;
	}

	return Math.round(score * 100) / 100;
}

/**
 * Recompute a project's SCORE from its sources' latest values; if the applied
 * level rises, pay retroactive top-ups for all approved ships (only levels
 * that change the RATE produce deltas). One transaction.
 */
export async function recomputeScore(projectId: number): Promise<void> {
	const [project] = await db()
		.select()
		.from(schema.projects)
		.where(and(eq(schema.projects.id, projectId), isNull(schema.projects.deletedAt)));

	if (!project) return;

	const sources = await db()
		.select({
			kind: schema.tractionSources.kind,
			verified: schema.tractionSources.verified,
			lastValue: schema.tractionSources.lastValue
		})
		.from(schema.tractionSources)
		.where(eq(schema.tractionSources.projectId, projectId));

	const score = scoreFor(sources);
	const candidate = levelFor(score);
	// review-gated levels only apply up to what staff have signed off
	const applied = candidate.requiresReview ? Math.min(candidate.level, project.maxReviewedLevel) : candidate.level;
	// high-water: levels never claw back; flagged projects freeze
	const newLevel = project.scoreFlagged ? project.level : Math.max(project.level, applied);

	if (newLevel === project.level) {
		await db()
			.update(schema.projects)
			.set({ score, scoreUpdatedAt: new Date() })
			.where(eq(schema.projects.id, projectId));

		return;
	}

	await db().transaction(async (tx) => {
		// approved ships + the highest level each has already been paid at
		const ships = await tx
			.select({
				shipId: schema.ships.id,
				userId: schema.ships.userId,
				projectId: schema.ships.projectId,
				hoursAssigned: schema.ships.hoursAssigned
			})
			.from(schema.ships)
			.where(and(eq(schema.ships.projectId, projectId), eq(schema.ships.status, 'approved')));

		const earns: ApprovedShipEarn[] = [];
		if (ships.length > 0) {
			const paid = await tx
				.select({
					shipId: schema.currencyLedger.shipId,
					paidLevel: max(schema.currencyLedger.level)
				})
				.from(schema.currencyLedger)
				.where(
					and(
						inArray(
							schema.currencyLedger.shipId,
							ships.map((s) => s.shipId)
						),
						sql`${schema.currencyLedger.kind} in ('earn_ship', 'earn_topup')`
					)
				)
				.groupBy(schema.currencyLedger.shipId);

			const paidMap = new Map(paid.map((p) => [p.shipId, p.paidLevel ?? 1]));
			for (const s of ships) {
				if (s.hoursAssigned == null) continue;

				earns.push({ ...s, hoursAssigned: s.hoursAssigned, paidLevel: paidMap.get(s.shipId) ?? 1 });
			}
		}

		const topups = computeTopups(earns, newLevel);
		if (topups.length > 0) {
			await tx.insert(schema.currencyLedger).values(topups).onConflictDoNothing();
		}

		await tx
			.update(schema.projects)
			.set({ level: newLevel, score, scoreUpdatedAt: new Date() })
			.where(eq(schema.projects.id, projectId));
	});
}
