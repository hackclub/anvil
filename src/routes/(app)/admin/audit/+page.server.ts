import { and, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { avatarUrl, gravatarUrl } from '$lib/server/avatar';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 100;

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const type = url.searchParams.get('type') ?? '';
	const page = Math.max(0, Number(url.searchParams.get('page')) || 0);

	const conds: SQL[] = [];
	if (type) {
		conds.push(eq(schema.auditLogs.actorType, type));
	}

	if (q) {
		const like = or(
			ilike(schema.auditLogs.action, `%${q}%`),
			ilike(schema.auditLogs.actorId, `%${q}%`),
			ilike(schema.auditLogs.entityId, `%${q}%`)
		);

		if (like) {
			conds.push(like);
		}
	}

	const where = conds.length > 0 ? and(...conds) : undefined;

	// prettier-ignore
	const [total] = await db()
		.select({ n: count() })
		.from(schema.auditLogs)
		.where(where);
	const rows = await db()
		.select()
		.from(schema.auditLogs)
		.where(where)
		.orderBy(desc(schema.auditLogs.createdAt))
		.limit(PAGE_SIZE)
		.offset(page * PAGE_SIZE);

	const userIds = [
		...new Set(
			rows
				.filter((r) => r.actorType === 'user' && r.actorId)
				.map((r) => Number(r.actorId))
				.filter((n) => Number.isInteger(n))
		)
	];

	const users =
		userIds.length > 0
			? await db()
					.select({
						id: schema.users.id,
						username: schema.users.username,
						email: schema.users.email,
						slackId: schema.users.slackId
					})
					.from(schema.users)
					.where(inArray(schema.users.id, userIds))
			: [];

	const byId = new Map(
		users.map((u) => [
			u.id,
			{
				name: u.username || u.email,
				avatar: avatarUrl(u.slackId, u.email),
				avatarFallback: gravatarUrl(u.email)
			}
		])
	);

	return {
		q,
		type,
		page,
		pageSize: PAGE_SIZE,
		total: total.n,
		logs: rows.map((r) => ({
			id: r.id,
			actorType: r.actorType,
			actorId: r.actorId,
			actor: (r.actorId && byId.get(Number(r.actorId))) || null,
			action: r.action,
			entityType: r.entityType,
			entityId: r.entityId,
			data: r.data as Record<string, unknown> | null,
			createdAt: r.createdAt.toISOString()
		}))
	};
};
