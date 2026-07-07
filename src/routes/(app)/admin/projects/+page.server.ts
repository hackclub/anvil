import { desc, eq, ilike } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const rows = await db()
		.select({
			id: schema.projects.id,
			title: schema.projects.title,
			shipStatus: schema.projects.shipStatus,
			level: schema.projects.level,
			score: schema.projects.score,
			scoreFlagged: schema.projects.scoreFlagged,
			locked: schema.projects.locked,
			deletedAt: schema.projects.deletedAt,
			ownerEmail: schema.users.email
		})
		.from(schema.projects)
		.innerJoin(schema.users, eq(schema.projects.userId, schema.users.id))
		.where(q ? ilike(schema.projects.title, `%${q}%`) : undefined)
		.orderBy(desc(schema.projects.createdAt))
		.limit(100);

	return { projects: rows, q };
};
