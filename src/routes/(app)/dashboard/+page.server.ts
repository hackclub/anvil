import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;
	const projects = await db()
		.select({
			id: schema.projects.id,
			title: schema.projects.title,
			shipStatus: schema.projects.shipStatus,
			level: schema.projects.level,
			locked: schema.projects.locked,
			createdAt: schema.projects.createdAt
		})
		.from(schema.projects)
		.where(and(eq(schema.projects.userId, userId), isNull(schema.projects.deletedAt)))
		.orderBy(desc(schema.projects.createdAt));

	// prettier-ignore
	const [ships] = await db()
		.select({ n: count() })
		.from(schema.ships)
		.where(eq(schema.ships.userId, userId));

	// prettier-ignore
	const [orders] = await db()
		.select({ n: count() })
		.from(schema.orders)
		.where(eq(schema.orders.userId, userId));

	return { projects, hasShipped: ships.n > 0, hasOrdered: orders.n > 0 };
};
