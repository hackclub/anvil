// Traction polling: snapshot every source, velocity-check for star-botting,
// then recompute SCORE (which pays retroactive top-ups on level rises).
import { eq, inArray, sql } from 'drizzle-orm';
import { ECONOMY } from '$lib/config/economy';
import { db, schema } from '../db';
import { recomputeScore } from '../economy/score';
import { FETCHERS } from '../services/traction/fetchers';
import { registerJob } from './index';

// Keep third-party APIs (GitHub especially, which is 60 req/hr unauthenticated)
// happy: space requests out, and back a failing source off exponentially
// instead of hammering it every run.
const POLL_SPACING_MS = 300;
const MAX_BACKOFF_HOURS = 24;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollSources(kinds: string[]): Promise<void> {
	const sources = await db()
		.select()
		.from(schema.tractionSources)
		.where(inArray(schema.tractionSources.kind, kinds as never));

	const touchedProjects = new Set<number>();

	let first = true;
	for (const source of sources) {
		const fetcher = FETCHERS[source.kind];
		if (!fetcher) continue;

		// exponential backoff for repeatedly-failing sources: 1h, 2h, 4h … capped
		// at 24h, so a permanently-broken ref doesn't retry every 30 minutes
		if (source.errorCount > 0 && source.lastPolledAt) {
			const backoffHours = Math.min(2 ** (source.errorCount - 1), MAX_BACKOFF_HOURS);
			const sinceHours = (Date.now() - source.lastPolledAt.getTime()) / 3_600_000;
			if (sinceHours < backoffHours) continue;
		}

		// throttle: small gap between outbound calls to stay under rate limits
		if (!first) await sleep(POLL_SPACING_MS);

		first = false;

		try {
			const result = await fetcher.fetch(source.externalRef);
			await db().insert(schema.tractionSnapshots).values({ sourceId: source.id, value: result.value, raw: result.raw });

			// star-velocity anti-abuse: implausible growth freezes the project's
			// level until staff clear it in /admin/score
			const prev = source.lastValue;
			const hoursSince = source.lastPolledAt ? (Date.now() - source.lastPolledAt.getTime()) / 3_600_000 : Infinity;

			if (prev != null && hoursSince <= ECONOMY.starVelocityFlag.windowHours) {
				const delta = result.value - prev;
				const ratioPerDay = (delta / Math.max(prev, 10)) * (24 / Math.max(hoursSince, 1));
				if (delta > ECONOMY.starVelocityFlag.maxDelta || ratioPerDay > ECONOMY.starVelocityFlag.maxRatioPerDay) {
					await db()
						.update(schema.projects)
						.set({ scoreFlagged: true })
						.where(eq(schema.projects.id, source.projectId));

					console.warn(
						`[traction] velocity flag: project ${source.projectId} ${source.kind}:${source.externalRef} ${prev} -> ${result.value} in ${hoursSince.toFixed(1)}h`
					);
				}
			}

			await db()
				.update(schema.tractionSources)
				.set({ lastValue: result.value, lastPolledAt: new Date(), errorCount: 0 })
				.where(eq(schema.tractionSources.id, source.id));

			touchedProjects.add(source.projectId);
		} catch (err) {
			await db()
				.update(schema.tractionSources)
				.set({
					errorCount: sql`${schema.tractionSources.errorCount} + 1`,
					lastPolledAt: new Date()
				})
				.where(eq(schema.tractionSources.id, source.id));

			console.warn(`[traction] poll failed ${source.kind}:${source.externalRef}:`, err);
		}
	}

	for (const projectId of touchedProjects) {
		await recomputeScore(projectId);
	}
}

registerJob({
	queue: 'traction.github',
	cron: '*/30 * * * *',
	handler: async () => pollSources(['github_repo'])
});

registerJob({
	queue: 'traction.packages',
	cron: '0 */6 * * *',
	handler: async () => pollSources(['npm', 'pypi', 'crates', 'chrome_ext', 'firefox_addon'])
});

// hourly safety net: score recompute for every project with sources (covers
// manual max_reviewed_level raises + missed chains)
registerJob({
	queue: 'score.recompute',
	cron: '30 * * * *',
	handler: async () => {
		const rows = await db()
			.selectDistinct({ projectId: schema.tractionSources.projectId })
			.from(schema.tractionSources);

		for (const r of rows) await recomputeScore(r.projectId);
	}
});
