// Raw entity inspector: the full state of one project and everything that
// hangs off it, as editable property sheets + a few corrective actions.
import { error, fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { recomputeScore } from '$lib/server/economy/score';
import { EDITABLE, type FieldSpec } from '$lib/admin/editable';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/** The [id] route param as an integer project id (404 on garbage). */
function pid(params: { id: string }): number {
	const n = Number(params.id);
	if (!Number.isInteger(n)) error(404);

	return n;
}

// entity kind -> table the property sheet writes to
const TABLES = {
	project: schema.projects,
	owner: schema.users,
	ship: schema.ships,
	review: schema.reviews,
	tractionSource: schema.tractionSources
} as const;

function parseValue(spec: FieldSpec, raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
	switch (spec.type) {
		case 'string':
			return { ok: true, value: raw };
		case 'boolean': {
			if (raw !== 'true' && raw !== 'false') return { ok: false, error: 'must be true or false' };

			return { ok: true, value: raw === 'true' };
		}
		case 'int': {
			const n = Number(raw);
			if (!Number.isInteger(n)) return { ok: false, error: 'must be an integer' };

			if (spec.min !== undefined && n < spec.min) return { ok: false, error: `min ${spec.min}` };

			if (spec.max !== undefined && n > spec.max) return { ok: false, error: `max ${spec.max}` };

			return { ok: true, value: n };
		}
		case 'number': {
			const n = Number(raw);
			if (!Number.isFinite(n)) return { ok: false, error: 'must be a number' };

			return { ok: true, value: n };
		}
		case 'enum': {
			{
				{
					{
						{
							{
								{
									{
										if (!spec.options.includes(raw))
											return { ok: false, error: `must be one of: ${spec.options.join(', ')}` };

										return { ok: true, value: raw };
									}
								}
							}
						}
					}
				}
			}
		}
	}
}

export const load: PageServerLoad = async ({ params }) => {
	const [project] = await db()
		.select()
		.from(schema.projects)
		.where(eq(schema.projects.id, pid(params)));

	if (!project) error(404);

	// prettier-ignore
	const [owner] = await db()
		.select()
		.from(schema.users)
		.where(eq(schema.users.id, project.userId));
	const ships = await db()
		.select()
		.from(schema.ships)
		.where(eq(schema.ships.projectId, project.id))
		.orderBy(asc(schema.ships.shipNumber));

	const reviews = await db()
		.select()
		.from(schema.reviews)
		.where(eq(schema.reviews.projectId, project.id))
		.orderBy(asc(schema.reviews.createdAt));

	const sources = await db()
		.select()
		.from(schema.tractionSources)
		.where(eq(schema.tractionSources.projectId, project.id));

	const ledger = await db()
		.select()
		.from(schema.currencyLedger)
		.where(eq(schema.currencyLedger.projectId, project.id))
		.orderBy(asc(schema.currencyLedger.createdAt));

	const links = await db()
		.select()
		.from(schema.hackatimeProjectLinks)
		.where(eq(schema.hackatimeProjectLinks.projectId, project.id));

	return {
		// owner is a LINK to the users section, not a sheet here
		owner: owner
			? { id: owner.id, email: owner.email, username: owner.username }
			: { id: project.userId, email: '?', username: null },
		hackatimeLinks: links.map((l) => ({ id: l.id, hackatimeKey: l.hackatimeKey })),
		entities: {
			project,
			ships,
			reviews,
			tractionSources: sources,
			ledger
		}
	};
};

export const actions: Actions = {
	// generic property-sheet write: whitelist-validated single-field update.
	// deliberately side-effect-free - the explicit buttons handle recomputes.
	setField: async ({ request, locals }) => {
		const form = await request.formData();
		const kind = String(form.get('kind') ?? '');
		const id = String(form.get('id') ?? '');
		const field = String(form.get('field') ?? '');
		const wantNull = form.get('null') === '1';

		const spec = EDITABLE[kind]?.[field];
		const table = TABLES[kind as keyof typeof TABLES];
		if (!spec || !table) return fail(400, { error: `${kind}.${field} is not editable` });

		if (!id) return fail(400, { error: 'missing row id' });

		// project/owner/ship rows have integer ids, the rest keep uuids
		const rowId: string | number = ['project', 'owner', 'ship'].includes(kind) ? Number(id) : id;

		let value: unknown;
		if (wantNull) {
			if (!('nullable' in spec) || !spec.nullable) return fail(400, { error: `${field} is not nullable` });

			value = null;
		} else {
			const parsed = parseValue(spec, String(form.get('value') ?? ''));
			if (!parsed.ok) return fail(400, { error: `${field}: ${parsed.error}` });

			value = parsed.value;
		}

		const updated = await db()
			.update(table)
			.set({ [field]: value })
			.where(eq(table.id, rowId as never))
			.returning({ id: table.id });

		if (updated.length === 0) return fail(404, { error: 'row not found' });

		audit({
			actorType: 'admin',
			actorId: locals.user!.email,
			action: 'admin.set_field',
			entityType: kind,
			entityId: id,
			data: { field, value: String(form.get('value') ?? ''), wantNull }
		});

		return { done: true };
	},

	// link/unlink hackatime keys on the user's behalf - same invariant as the
	// user-facing toggle: one key feeds at most ONE project per user
	linkKey: async ({ params, request, locals }) => {
		const form = await request.formData();
		const key = String(form.get('key') ?? '').trim();
		if (!key) return fail(400, { error: 'a hackatime key is required' });

		const [project] = await db()
			.select()
			.from(schema.projects)
			.where(eq(schema.projects.id, pid(params)));

		if (!project) return fail(404, { error: 'project not found' });

		const [existing] = await db()
			.select({
				id: schema.hackatimeProjectLinks.id,
				title: schema.projects.title
			})
			.from(schema.hackatimeProjectLinks)
			.innerJoin(schema.projects, eq(schema.hackatimeProjectLinks.projectId, schema.projects.id))
			.where(
				and(eq(schema.hackatimeProjectLinks.userId, project.userId), eq(schema.hackatimeProjectLinks.hackatimeKey, key))
			);

		if (existing) return fail(400, { error: `"${key}" is already linked to "${existing.title}"` });

		await db()
			.insert(schema.hackatimeProjectLinks)
			.values({ userId: project.userId, projectId: project.id, hackatimeKey: key });

		audit({
			actorType: 'admin',
			actorId: locals.user!.email,
			action: 'admin.link_key',
			entityType: 'project',
			entityId: params.id,
			data: { form: Object.fromEntries(form.entries()) }
		});

		return { done: true };
	},

	unlinkKey: async ({ params, request, locals }) => {
		const form = await request.formData();
		const linkId = String(form.get('linkId') ?? '');
		await db()
			.delete(schema.hackatimeProjectLinks)
			.where(and(eq(schema.hackatimeProjectLinks.id, linkId), eq(schema.hackatimeProjectLinks.projectId, pid(params))));

		audit({
			actorType: 'admin',
			actorId: locals.user!.email,
			action: 'admin.unlink_key',
			entityType: 'project',
			entityId: params.id,
			data: { form: Object.fromEntries(form.entries()) }
		});

		return { done: true };
	},

	setMaxLevel: async ({ params, request, locals }) => {
		const form = await request.formData();
		const level = Number(form.get('level'));
		if (!Number.isInteger(level) || level < 1 || level > 10) return fail(400, { error: 'level must be 1–10' });

		await db()
			.update(schema.projects)
			.set({ maxReviewedLevel: level })
			.where(eq(schema.projects.id, pid(params)));

		await recomputeScore(pid(params)); // applies + pays top-ups immediately
		audit({
			actorType: 'admin',
			actorId: locals.user!.email,
			action: 'admin.set_max_level',
			entityType: 'project',
			entityId: params.id,
			data: { form: Object.fromEntries(form.entries()) }
		});

		return { done: true };
	},

	unflag: async ({ params, locals }) => {
		await db()
			.update(schema.projects)
			.set({ scoreFlagged: false })
			.where(eq(schema.projects.id, pid(params)));

		await recomputeScore(pid(params));
		audit({
			actorType: 'admin',
			actorId: locals.user!.email,
			action: 'admin.score_unflag',
			entityType: 'project',
			entityId: params.id
		});

		return { done: true };
	},

	unlock: async ({ params, locals }) => {
		await db()
			.update(schema.projects)
			.set({ locked: false })
			.where(eq(schema.projects.id, pid(params)));

		audit({
			actorType: 'admin',
			actorId: locals.user!.email,
			action: 'admin.project_unlock',
			entityType: 'project',
			entityId: params.id
		});

		return { done: true };
	},

	verifySource: async ({ request, locals }) => {
		const form = await request.formData();
		const sourceId = String(form.get('sourceId') ?? '');
		// prettier-ignore
		await db()
			.update(schema.tractionSources)
			.set({ verified: true })
			.where(eq(schema.tractionSources.id, sourceId));

		audit({
			actorType: 'admin',
			actorId: locals.user!.email,
			action: 'admin.verify_source',
			entityType: 'traction_source',
			entityId: String(form.get('sourceId') ?? ''),
			data: { form: Object.fromEntries(form.entries()) }
		});

		return { done: true };
	}
};
