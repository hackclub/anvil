import { fail } from '@sveltejs/kit';
import { desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { fetchLiveProfile } from '$lib/server/auth/hca';
import { audit } from '$lib/server/audit';
import { avatarUrl, gravatarUrl } from '$lib/server/avatar';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const users = await db()
		.select({
			id: schema.users.id,
			email: schema.users.email,
			username: schema.users.username,
			slackId: schema.users.slackId,
			hcaId: schema.users.hcaId,
			hackatimeId: schema.users.hackatimeId,
			verificationStatus: schema.users.verificationStatus,
			yswsEligible: schema.users.yswsEligible,
			hackatimeTrustLevel: schema.users.hackatimeTrustLevel,
			isAdmin: schema.users.isAdmin,
			isBanned: schema.users.isBanned,
			banReason: schema.users.banReason,
			internalNotes: schema.users.internalNotes,
			balance: sql<string>`coalesce((select sum(amount) from currency_ledger where user_id = users.id), 0)`
		})
		.from(schema.users)
		.where(
			q
				? or(ilike(schema.users.email, `%${q}%`), ilike(schema.users.username, `%${q}%`), eq(schema.users.slackId, q))
				: isNull(schema.users.deletedAt)
		)
		.orderBy(desc(schema.users.createdAt))
		.limit(100);

	// expanded-row extras for the listed users: their projects + ledger history
	const ids = users.map((u) => u.id);
	const projects = ids.length
		? await db()
				.select({
					id: schema.projects.id,
					userId: schema.projects.userId,
					title: schema.projects.title,
					shipStatus: schema.projects.shipStatus
				})
				.from(schema.projects)
				.where(inArray(schema.projects.userId, ids))
				.orderBy(desc(schema.projects.createdAt))
		: [];

	const ledger = ids.length
		? await db()
				.select({
					id: schema.currencyLedger.id,
					userId: schema.currencyLedger.userId,
					kind: schema.currencyLedger.kind,
					amount: schema.currencyLedger.amount,
					note: schema.currencyLedger.note,
					projectId: schema.currencyLedger.projectId,
					createdAt: schema.currencyLedger.createdAt
				})
				.from(schema.currencyLedger)
				.where(inArray(schema.currencyLedger.userId, ids))
				.orderBy(desc(schema.currencyLedger.createdAt))
		: [];

	const projectsByUser: Record<string, typeof projects> = {};
	for (const p of projects) (projectsByUser[p.userId] ??= []).push(p);
	const ledgerByUser: Record<string, typeof ledger> = {};
	for (const l of ledger) (ledgerByUser[l.userId] ??= []).push(l);

	return {
		users: users.map((u) => ({
			...u,
			avatar: avatarUrl(u.slackId, u.email),
			avatarFallback: gravatarUrl(u.email)
		})),
		projectsByUser,
		ledgerByUser,
		q
	};
};

export const actions: Actions = {
	ban: async ({ request, locals }) => {
		const form = await request.formData();
		const userId = Number(form.get('userId'));
		const reason = String(form.get('reason') ?? '').trim();
		if (!reason) return fail(400, { error: 'a ban needs a reason' });

		// prettier-ignore
		await db()
			.update(schema.users)
			.set({ isBanned: true, banReason: reason })
			.where(eq(schema.users.id, userId));
		// bans kill all sessions immediately
		await db().delete(schema.sessions).where(eq(schema.sessions.userId, userId));
		audit({
			actorType: 'admin',
			actorId: locals.user!.email,
			action: 'admin.user_ban',
			entityType: 'user',
			entityId: userId,
			data: { reason }
		});

		return { done: true };
	},

	unban: async ({ request, locals }) => {
		const form = await request.formData();
		const userId = Number(form.get('userId'));
		// prettier-ignore
		await db()
			.update(schema.users)
			.set({ isBanned: false, banReason: null })
			.where(eq(schema.users.id, userId));

		audit({
			actorType: 'admin',
			actorId: locals.user!.email,
			action: 'admin.user_unban',
			entityType: 'user',
			entityId: userId
		});

		return { done: true };
	},

	adjust: async ({ request, locals }) => {
		const form = await request.formData();
		const userId = Number(form.get('userId'));
		const amount = Number(form.get('amount'));
		const note = String(form.get('note') ?? '').trim();
		if (!Number.isFinite(amount) || amount === 0) return fail(400, { error: 'amount must be a nonzero number' });

		if (!note) return fail(400, { error: 'adjustments need a note' });

		await db()
			.insert(schema.currencyLedger)
			.values({
				userId,
				kind: 'adjustment',
				amount,
				note,
				createdByActorId: locals.user!.slackId ?? locals.user!.hcaId
			});

		audit({
			actorType: 'admin',
			actorId: locals.user!.email,
			action: 'admin.sparks_adjust',
			entityType: 'user',
			entityId: userId,
			data: { amount, note }
		});

		return { done: true };
	},

	// live PII peek - we store none of it, so this hits HCA on demand.
	// returned via `form` only: rendered transiently, never persisted.
	hcaInfo: async ({ request, locals }) => {
		const form = await request.formData();
		const userId = Number(form.get('userId'));
		// prettier-ignore
		const [user] = await db()
			.select()
			.from(schema.users)
			.where(eq(schema.users.id, userId));
		if (!user) return fail(404, { error: 'user not found' });

		try {
			const profile = await fetchLiveProfile(user);
			// PII access is exactly what the audit trail is for
			audit({
				actorType: 'admin',
				actorId: locals.user!.email,
				action: 'admin.hca_info_view',
				entityType: 'user',
				entityId: userId
			});

			return { hcaInfo: { userId, ...profile } };
		} catch (err) {
			return fail(502, {
				error: `couldn't fetch from HCA (${err instanceof Error ? err.message : err}) - the user may need to re-login`
			});
		}
	},

	notes: async ({ request, locals }) => {
		const form = await request.formData();
		const userId = Number(form.get('userId'));
		await db()
			.update(schema.users)
			.set({ internalNotes: String(form.get('notes') ?? '') })
			.where(eq(schema.users.id, userId));

		audit({
			actorType: 'admin',
			actorId: locals.user!.email,
			action: 'admin.user_notes',
			entityType: 'user',
			entityId: userId
		});

		return { done: true };
	}
};
