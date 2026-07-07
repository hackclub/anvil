// Housekeeping: verification refresh, trust refresh, budget audit, cleanup.
import { and, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { ECONOMY } from '$lib/config/economy';
import { db, schema } from '../db';
import { checkVerification } from '../auth/hca';
import { getTrustLevel } from '../services/hackatime';
import { hackatimeIdentity } from '../ships/queries';
import { registerJob } from './index';

registerJob({
	queue: 'verification.refresh',
	cron: '0 4 * * *',
	handler: async () => {
		const users = await db()
			.select()
			.from(schema.users)
			.where(and(ne(schema.users.verificationStatus, 'verified'), isNull(schema.users.deletedAt)));

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
			}
		}
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

		for (const user of users) {
			const ident = hackatimeIdentity(user);
			if (!ident) continue;

			const trust = await getTrustLevel(ident);
			await db()
				.update(schema.users)
				.set({ hackatimeTrustLevel: trust, trustCheckedAt: new Date() })
				.where(eq(schema.users.id, user.id));
		}
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

		const earned = Number(row.earned);
		const hours = Number(row.hours);
		if (hours > 0) {
			const avg = earned / hours;
			const msg = `[budget] realized $${avg.toFixed(2)}/hr across ${hours.toFixed(0)} approved hours (target ≤ $${ECONOMY.budgetAvgTarget}/hr)`;
			if (avg > ECONOMY.budgetAvgTarget) {
				console.error(msg + ' - OVER TARGET, retune tiers!');
			} else {
				console.log(msg);
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
	}
});
