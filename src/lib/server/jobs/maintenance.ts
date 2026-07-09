// Housekeeping: verification refresh, trust refresh, budget audit, cleanup.
import { and, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { ECONOMY, SPARKS_PER_USD } from '$lib/config/economy';
import { createLogger } from '$lib/log';
import { db, schema } from '../db';
import { checkVerification } from '../auth/hca';
import { getTrustLevel } from '../services/hackatime';
import { hackatimeIdentity } from '../ships/queries';
import { registerJob } from './index';

const log = createLogger('jobs.maintenance');

registerJob({
	queue: 'verification.refresh',
	cron: '0 4 * * *',
	handler: async () => {
		const users = await db()
			.select()
			.from(schema.users)
			.where(and(ne(schema.users.verificationStatus, 'verified'), isNull(schema.users.deletedAt)));

		let refreshed = 0;
		for (const user of users) {
			const result = await checkVerification(user.hcaId);
			if (result) {
				await db()
					.update(schema.users)
					.set({
						verificationStatus: result.status,
						yswsEligible: result.eligible,
						verificationRefreshedAt: new Date()
					})
					.where(eq(schema.users.id, user.id));
				refreshed++;
			}
		}
		log.info('verification refresh', { candidates: users.length, refreshed });
	}
});

registerJob({
	queue: 'trust.refresh',
	cron: '0 5 * * 0',
	handler: async () => {
		const users = await db()
			.select()
			.from(schema.users)
			.where(and(isNull(schema.users.deletedAt), sql`${schema.users.hackatimeId} is not null`));

		let updated = 0;
		for (const user of users) {
			const ident = hackatimeIdentity(user);
			if (!ident) continue;

			const trust = await getTrustLevel(ident);
			await db()
				.update(schema.users)
				.set({ hackatimeTrustLevel: trust, trustCheckedAt: new Date() })
				.where(eq(schema.users.id, user.id));
			updated++;
		}
		log.info('trust refresh', { candidates: users.length, updated });
	}
});

registerJob({
	queue: 'budget.audit',
	cron: '0 9 * * 1',
	handler: async () => {
		const [row] = await db()
			.select({
				earned: sql<string>`coalesce(sum(${schema.currencyLedger.amount}), 0)`,
				hours: sql<string>`coalesce(sum(${schema.currencyLedger.hoursBasis}) filter (where ${schema.currencyLedger.kind} = 'earn_ship'), 0)`
			})
			.from(schema.currencyLedger)
			.where(inArray(schema.currencyLedger.kind, ['earn_ship', 'earn_topup']));

		const earned = Number(row.earned) / SPARKS_PER_USD;
		const hours = Number(row.hours);
		if (hours > 0) {
			const avg = earned / hours;
			const data = {
				avgPerHour: Number(avg.toFixed(2)),
				approvedHours: Number(hours.toFixed(0)),
				target: ECONOMY.budgetAvgTarget
			};
			if (avg > ECONOMY.budgetAvgTarget) {
				log.error('budget OVER TARGET - retune tiers', data);
			} else {
				log.info('budget within target', data);
			}
		}
	}
});

registerJob({
	queue: 'cleanup',
	cron: '30 4 * * *',
	handler: async () => {
		await db().delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
		await db()
			.delete(schema.tractionSnapshots)
			.where(lt(schema.tractionSnapshots.capturedAt, new Date(Date.now() - 180 * 86400_000)));
		log.info('cleanup complete', { deleted: 'expired sessions + snapshots >180d' });
	}
});
