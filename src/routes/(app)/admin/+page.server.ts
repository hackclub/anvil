import { count, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [users] = await db().select({ n: count() }).from(schema.users);
	const [projects] = await db().select({ n: count() }).from(schema.projects);
	const [pendingShips] = await db()
		.select({ n: count() })
		.from(schema.ships)
		.where(inArray(schema.ships.status, ['pending', 'pending_hq']));

	const [approvedShips] = await db()
		.select({ n: count() })
		.from(schema.ships)
		.where(eq(schema.ships.status, 'approved'));

	const [pendingOrders] = await db()
		.select({ n: count() })
		.from(schema.orders)
		.where(eq(schema.orders.status, 'pending'));

	const [econ] = await db()
		.select({
			earned: sql<string>`coalesce(sum(${schema.currencyLedger.amount}) filter (where ${schema.currencyLedger.kind} in ('earn_ship','earn_topup')), 0)`,
			hours: sql<string>`coalesce(sum(${schema.currencyLedger.hoursBasis}) filter (where ${schema.currencyLedger.kind} = 'earn_ship'), 0)`
		})
		.from(schema.currencyLedger);

	const earned = Number(econ.earned);
	const hours = Number(econ.hours);
	return {
		stats: {
			users: users.n,
			projects: projects.n,
			pendingShips: pendingShips.n,
			approvedShips: approvedShips.n,
			pendingOrders: pendingOrders.n,
			sparksEarned: earned,
			approvedHours: hours,
			avgRate: hours > 0 ? Math.round((earned / hours) * 100) / 100 : 0
		}
	};
};
