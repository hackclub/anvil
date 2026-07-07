import { fail } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { requireProject } from '$lib/server/projects';
import { currentWindow, hackatimeIdentity, projectKeys } from '$lib/server/ships/queries';
import { getKeySeconds, listUserProjects } from '$lib/server/services/hackatime';
import { publicUrl } from '$lib/server/services/storage';
import { ensureInferredSources } from '$lib/server/services/traction/manage';
import { ensureHackatimeLinked } from '$lib/server/services/hackatimeLink';
import { MIN_SHIP_SECONDS } from '$lib/config/season';
import { ECONOMY, QUESTS } from '$lib/config/economy';
import { completedQuestIds, completeQuest, QuestError, questsUnlocked } from '$lib/server/economy/quests';

import { cancelShip, ShipError } from '$lib/server/ships/ship';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user!;
	const project = await requireProject(params.id, user);
	// sources are fully automatic (repo -> stars, registry demo -> downloads);
	// re-syncing on load also backfills projects from before inference existed
	await ensureInferredSources(project);
	const keys = await projectKeys(project.id);
	const window = await currentWindow(project.id);
	const ident = hackatimeIdentity(user);

	let keySeconds: { key: string; seconds: number }[] = [];
	let availableKeys: { name: string; total_seconds: number }[] = [];
	let hackatimeError: string | null = null;
	if (ident) {
		try {
			const [ks, ak] = await Promise.all([
				getKeySeconds(ident, keys, window.start, window.end),
				listUserProjects(ident)
			]);

			keySeconds = ks;
			availableKeys = ak;
		} catch {
			hackatimeError = "couldn't reach hackatime - hours may be missing";
		}
	}

	// hackatime keys feeding the user's OTHER projects (struck out in the list)
	const otherLinks = await db()
		.select({
			key: schema.hackatimeProjectLinks.hackatimeKey,
			title: schema.projects.title
		})
		.from(schema.hackatimeProjectLinks)
		.innerJoin(schema.projects, eq(schema.hackatimeProjectLinks.projectId, schema.projects.id))
		.where(
			and(
				eq(schema.hackatimeProjectLinks.userId, user.id),
				ne(schema.hackatimeProjectLinks.projectId, project.id),
				isNull(schema.projects.deletedAt)
			)
		);

	const assignedElsewhere = Object.fromEntries(otherLinks.map((l) => [l.key, l.title]));

	const sourceRows = await db()
		.select({
			id: schema.tractionSources.id,
			kind: schema.tractionSources.kind,
			externalRef: schema.tractionSources.externalRef,
			verified: schema.tractionSources.verified,
			lastValue: schema.tractionSources.lastValue
		})
		.from(schema.tractionSources)
		.where(eq(schema.tractionSources.projectId, project.id));
	// per-source SCORE contribution (weights stay server-side - the UI shows
	// the score each source earns, never the raw metric -> score conversion)
	const sources = sourceRows.map((src) => ({
		...src,
		score:
			src.verified && src.lastValue != null
				? Math.round((ECONOMY.weights[src.kind] ?? 0) * src.lastValue * 100) / 100
				: 0
	}));

	const ships = await db()
		.select()
		.from(schema.ships)
		.where(eq(schema.ships.projectId, project.id))
		.orderBy(asc(schema.ships.shipNumber));

	// extra sparks this project earned FROM SCORE (all retroactive top-ups)
	const [topupRow] = await db()
		.select({ total: sql<string>`coalesce(sum(${schema.currencyLedger.amount}), 0)` })
		.from(schema.currencyLedger)
		.where(and(eq(schema.currencyLedger.projectId, project.id), eq(schema.currencyLedger.kind, 'earn_topup')));

	const scoreSparks = Number(topupRow.total);

	// sparks earned by the latest approved ship (incl. retroactive top-ups)
	let lastShipSparks = 0;
	const lastApproved = [...ships].reverse().find((s) => s.status === 'approved');
	if (lastApproved) {
		const [row] = await db()
			.select({ total: sql<string>`coalesce(sum(${schema.currencyLedger.amount}), 0)` })
			.from(schema.currencyLedger)
			.where(
				and(
					eq(schema.currencyLedger.shipId, lastApproved.id),
					inArray(schema.currencyLedger.kind, ['earn_ship', 'earn_topup'])
				)
			);

		lastShipSparks = Number(row.total);
	}

	const reviews = await db()
		.select()
		.from(schema.reviews)
		.where(
			and(
				eq(schema.reviews.projectId, project.id),
				isNull(schema.reviews.deletedAt),
				// users see public feedback only - internal notes stay internal,
				// and held approvals aren't decisions yet
				ne(schema.reviews.kind, 'internal_comment'),
				eq(schema.reviews.held, false)
			)
		)
		.orderBy(asc(schema.reviews.createdAt));

	return {
		project: {
			id: project.id,
			title: project.title,
			description: project.description,
			demoUrl: project.demoUrl,
			repoUrl: project.repoUrl,
			screenshotUrl: publicUrl(project.screenshotKey),
			shipStatus: project.shipStatus,
			locked: project.locked,
			level: project.level,
			score: project.score,
			scoreFlagged: project.scoreFlagged,
			maxReviewedLevel: project.maxReviewedLevel
		},
		sources,
		levels: ECONOMY.levels.map((l) => ({
			level: l.level,
			minScore: l.minScore,
			rate: l.ratePerHour,
			requiresReview: !!l.requiresReview
		})),
		quests: {
			unlocked: await questsUnlocked(project.id),
			completed: await completedQuestIds(project.id),
			catalog: QUESTS.map((q) => ({
				id: q.id,
				title: q.title,
				score: q.score,
				kind: q.kind,
				note: q.note ?? null
			}))
		},
		keys,
		keySeconds,
		availableKeys,
		assignedElsewhere,
		hackatimeError,
		window: { start: window.start.toISOString(), end: window.end.toISOString() },
		minShipSeconds: MIN_SHIP_SECONDS,
		lastShipSparks,
		scoreSparks,
		ships: ships.map((s) => ({
			id: s.id,
			shipNumber: s.shipNumber,
			status: s.status,
			secondsSubmitted: s.secondsSubmitted,
			hoursAssigned: s.hoursAssigned,
			submittedAt: s.windowEnd.toISOString(),
			decidedAt: s.decidedAt?.toISOString() ?? null
		})),
		reviews: reviews.map((r) => ({
			id: r.id,
			shipId: r.shipId,
			kind: r.kind,
			held: r.held,
			feedback: r.feedback,
			createdAt: r.createdAt.toISOString()
		}))
	};
};

export const actions: Actions = {
	// pull a PENDING ship back out of review (window unaffected)
	cancelShip: async ({ locals, params }) => {
		const project = await requireProject(params.id, locals.user!);
		try {
			await cancelShip(project, locals.user!);
		} catch (err) {
			if (err instanceof ShipError) return fail(400, { error: err.message });

			throw err;
		}

		return { shipCancelled: true };
	},

	// complete a promotion quest (SCORE bounty, once per project per quest)
	quest: async ({ locals, params, request }) => {
		const project = await requireProject(params.id, locals.user!);
		const form = await request.formData();
		const questId = String(form.get('questId') ?? '');
		const proofUrl = String(form.get('proofUrl') ?? '').trim() || null;
		try {
			await completeQuest({ id: project.id, userId: project.userId, repoUrl: project.repoUrl }, questId, proofUrl);
		} catch (err) {
			if (err instanceof QuestError) return fail(400, { error: err.message });

			throw err;
		}

		return { questDone: questId };
	},

	// the gate selector stages toggles locally; "confirm selection" commits
	// the full selection here in one payload (link + unlink as a diff)
	setKeys: async ({ locals, params, request }) => {
		const user = locals.user!;
		const project = await requireProject(params.id, user);
		const form = await request.formData();
		const keys = [...new Set(form.getAll('keys').map(String).filter(Boolean))];
		if (keys.length === 0) return fail(400, { error: 'select at least one hackatime project' });

		if (keys.length > 200) return fail(400, { error: 'too many keys' });

		// keys feeding the user's OTHER projects can't be claimed
		const taken = await db()
			.select({ key: schema.hackatimeProjectLinks.hackatimeKey })
			.from(schema.hackatimeProjectLinks)
			.innerJoin(schema.projects, eq(schema.hackatimeProjectLinks.projectId, schema.projects.id))
			.where(
				and(
					eq(schema.hackatimeProjectLinks.userId, user.id),
					ne(schema.hackatimeProjectLinks.projectId, project.id),
					isNull(schema.projects.deletedAt),
					inArray(schema.hackatimeProjectLinks.hackatimeKey, keys)
				)
			);

		if (taken.length > 0) {
			return fail(400, { error: `"${taken[0].key}" is already linked to another project` });
		}

		await db().transaction(async (tx) => {
			await tx
				.delete(schema.hackatimeProjectLinks)
				.where(
					and(
						eq(schema.hackatimeProjectLinks.projectId, project.id),
						notInArray(schema.hackatimeProjectLinks.hackatimeKey, keys)
					)
				);

			await tx
				.insert(schema.hackatimeProjectLinks)
				.values(keys.map((key) => ({ userId: user.id, projectId: project.id, hackatimeKey: key })))
				.onConflictDoNothing();
		});

		return { keysSet: true };
	},

	findHackatime: async ({ locals }) => {
		const id = await ensureHackatimeLinked(locals.user!);
		if (!id) {
			return fail(404, {
				error:
					"couldn't find a Hackatime account for your slack id or email - set one up at hackatime.hackclub.com and track a little time first"
			});
		}

		return { linked: true };
	}
};
