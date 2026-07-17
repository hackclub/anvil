// SUBMIT_REVIEW_ACTION / UPDATE_REVIEW_ACTION logic.
// Flow: a plain `approve` creates a HELD review (ship -> pending_hq); Sidekick's
// own RBAC decides who may `authorize`, which finalizes the approval (hours,
// sparks payout, Airtable sync). `deauthorize` reverts to pending. When Sidekick
// marks the caller as an HQ reviewer (`isHq`), `approve` finalizes outright in a
// single step instead of parking the ship in the pending_hq queue.
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { rateForLevel } from '$lib/config/economy';
import { award } from '../economy/ledger';
import { queueAirtableSync } from '../services/airtable';
import { dmComment, dmShipApproved, dmShipRejected } from '../services/slackNotify';
import type { Review, Ship } from '../db/schema';
import { reviewEvent, type TimelineEvent } from './serialize';

export class SidekickError extends Error {
	constructor(
		public code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR',
		message: string
	) {
		super(message);
	}
}

async function getShip(shipId: number): Promise<Ship> {
	// prettier-ignore
	const [ship] = await db()
		.select()
		.from(schema.ships)
		.where(eq(schema.ships.id, shipId));
	if (!ship) throw new SidekickError('NOT_FOUND', `no ship with id ${shipId}`);

	return ship;
}

/** The ship's project + its author, for participant-facing DMs. */
async function projectAndAuthor(ship: Ship) {
	const [row] = await db()
		.select()
		.from(schema.projects)
		.innerJoin(schema.users, eq(schema.projects.userId, schema.users.id))
		.where(eq(schema.projects.id, ship.projectId));

	return row ?? null;
}

async function setShipAndProjectStatus(
	shipId: number,
	projectId: number,
	// cancellation is a USER action (ships/ship.ts), never a review outcome
	status: Exclude<Ship['status'], 'cancelled'>,
	extra: Partial<typeof schema.ships.$inferInsert> = {}
) {
	await db()
		.update(schema.ships)
		.set({ status, ...extra })
		.where(eq(schema.ships.id, shipId));

	// prettier-ignore
	await db()
		.update(schema.projects)
		.set({ shipStatus: status })
		.where(eq(schema.projects.id, projectId));
}

/**
 * Finalize an approval: ship/project -> approved, pay sparks at the project's
 * current level (idempotent), queue the Airtable sync, and DM the author. Shared
 * by `authorize` (second sign-off on a held approval) and an HQ `approve` (which
 * finalizes outright). `review` must already be non-held.
 */
async function finalizeApproval(ship: Ship, review: Review, hours: number, reviewerId: string): Promise<TimelineEvent> {
	await setShipAndProjectStatus(ship.id, ship.projectId, 'approved', {
		hoursAssigned: hours,
		decidedAt: new Date()
	});

	// sparks payout at the project's CURRENT applied level (idempotent)
	// prettier-ignore
	const [project] = await db()
		.select()
		.from(schema.projects)
		.where(eq(schema.projects.id, ship.projectId));

	const rate = rateForLevel(project.level);
	const sparks = Math.round(hours * rate * 100) / 100;
	await award({
		userId: ship.userId,
		kind: 'earn_ship',
		amount: sparks,
		projectId: ship.projectId,
		shipId: ship.id,
		level: project.level,
		rate,
		hoursBasis: hours,
		createdByActorId: reviewerId
	});

	await queueAirtableSync(ship.projectId, ship.id, review.id);
	// DM when sparks actually land - never on a held approval, which deauthorize
	// can still pull back
	const authored = await projectAndAuthor(ship);
	if (authored) {
		dmShipApproved(authored.users, authored.projects, ship.shipNumber, sparks, review.feedback ?? '');
	}

	return reviewEvent(review);
}

export interface ReviewInput {
	shipId: number;
	reviewerId: string;
	action: 'approve' | 'reject' | 'comment' | 'internal_comment' | 'authorize' | 'deauthorize';
	// Sidekick sets this when the reviewer has HQ authority; an HQ `approve`
	// finalizes outright instead of parking the ship in the pending_hq queue.
	isHq?: boolean;
	hoursAssigned?: number;
	feedbackMessage?: string;
	justification?: string;
	internalMessage?: string;
	commentText?: string;
	fields?: Record<string, string | number | boolean>;
}

export async function submitReviewAction(input: ReviewInput): Promise<TimelineEvent> {
	const ship = await getShip(input.shipId);

	switch (input.action) {
		case 'approve': {
			if (ship.status !== 'pending') {
				throw new SidekickError('VALIDATION_ERROR', `ship is ${ship.status}, expected pending`);
			}

			if (input.hoursAssigned == null) {
				throw new SidekickError('VALIDATION_ERROR', 'hoursAssigned is required for approve');
			}

			// an HQ reviewer's approval finalizes outright - no held review, no
			// pending_hq detour, no second sign-off required
			const isHq = input.isHq === true;

			const [review] = await db()
				.insert(schema.reviews)
				.values({
					shipId: ship.id,
					projectId: ship.projectId,
					reviewerActorId: input.reviewerId,
					kind: 'approval',
					held: !isHq,
					hoursAssigned: input.hoursAssigned,
					feedback: input.feedbackMessage ?? '',
					justification: input.justification ?? '',
					fields: input.fields
				})
				.returning();

			if (isHq) {
				return finalizeApproval(ship, review, input.hoursAssigned, input.reviewerId);
			}

			await setShipAndProjectStatus(ship.id, ship.projectId, 'pending_hq');
			return reviewEvent(review);
		}

		case 'authorize': {
			if (ship.status !== 'pending_hq') {
				throw new SidekickError('VALIDATION_ERROR', `ship is ${ship.status}, expected pending_hq`);
			}

			const held = await heldApproval(ship.id);
			if (!held) throw new SidekickError('NOT_FOUND', 'no held approval for this ship');

			const hours = input.hoursAssigned ?? held.hoursAssigned ?? 0;
			const [review] = await db()
				.update(schema.reviews)
				.set({ held: false, hoursAssigned: hours })
				.where(eq(schema.reviews.id, held.id))
				.returning();

			return finalizeApproval(ship, review, hours, input.reviewerId);
		}

		case 'deauthorize': {
			if (ship.status !== 'pending_hq') {
				throw new SidekickError('VALIDATION_ERROR', `ship is ${ship.status}, expected pending_hq`);
			}

			const held = await heldApproval(ship.id);
			if (held) {
				// prettier-ignore
				await db()
					.update(schema.reviews)
					.set({ deletedAt: new Date() })
					.where(eq(schema.reviews.id, held.id));
			}

			await setShipAndProjectStatus(ship.id, ship.projectId, 'pending');
			return {
				type: 'comment',
				actorId: input.reviewerId,
				message: 'review deauthorized - back to the queue',
				isInternal: true,
				timestamp: new Date().toISOString()
			};
		}

		case 'reject': {
			if (ship.status !== 'pending' && ship.status !== 'pending_hq') {
				throw new SidekickError('VALIDATION_ERROR', `ship is ${ship.status}, expected pending`);
			}

			const hard = input.fields?.hard_reject === true;
			const [review] = await db()
				.insert(schema.reviews)
				.values({
					shipId: ship.id,
					projectId: ship.projectId,
					reviewerActorId: input.reviewerId,
					kind: 'rejection',
					feedback: input.feedbackMessage ?? '',
					internalMessage: input.internalMessage,
					fields: input.fields
				})
				.returning();

			await setShipAndProjectStatus(ship.id, ship.projectId, 'rejected', {
				decidedAt: new Date(),
				hardRejected: hard
			});

			if (hard) {
				// prettier-ignore
				await db()
					.update(schema.projects)
					.set({ locked: true })
					.where(eq(schema.projects.id, ship.projectId));
			}

			const authored = await projectAndAuthor(ship);
			if (authored) {
				dmShipRejected(authored.users, authored.projects, ship.shipNumber, review.feedback ?? '');
			}

			return reviewEvent(review);
		}

		case 'comment':
		case 'internal_comment': {
			const [review] = await db()
				.insert(schema.reviews)
				.values({
					shipId: ship.id,
					projectId: ship.projectId,
					reviewerActorId: input.reviewerId,
					kind: input.action,
					feedback: input.commentText ?? ''
				})
				.returning();
			// public comments reach the author; internal ones stay internal
			if (input.action === 'comment') {
				const authored = await projectAndAuthor(ship);
				if (authored) {
					dmComment(authored.users, authored.projects, review.feedback ?? '');
				}
			}

			return reviewEvent(review);
		}
	}
}

async function heldApproval(shipId: number): Promise<Review | null> {
	const [row] = await db()
		.select()
		.from(schema.reviews)
		.where(
			and(
				eq(schema.reviews.shipId, shipId),
				eq(schema.reviews.kind, 'approval'),
				eq(schema.reviews.held, true),
				isNull(schema.reviews.deletedAt)
			)
		)
		.orderBy(desc(schema.reviews.createdAt))
		.limit(1);

	return row ?? null;
}

export interface UpdateReviewInput {
	shipId: number;
	reviewerId: string;
	type: 'approval' | 'rejection';
	feedbackMessage: string;
	justification?: string;
	internalMessage?: string;
	fields?: Record<string, string | number | boolean>;
}

export async function updateReviewAction(input: UpdateReviewInput): Promise<void> {
	const [review] = await db()
		.select()
		.from(schema.reviews)
		.where(
			and(
				eq(schema.reviews.shipId, input.shipId),
				eq(schema.reviews.reviewerActorId, input.reviewerId),
				eq(schema.reviews.kind, input.type),
				isNull(schema.reviews.deletedAt)
			)
		)
		.orderBy(desc(schema.reviews.createdAt))
		.limit(1);

	if (!review) throw new SidekickError('NOT_FOUND', 'no matching review to update');

	await db()
		.update(schema.reviews)
		.set({
			feedback: input.feedbackMessage,
			...(input.justification !== undefined ? { justification: input.justification } : {}),
			...(input.internalMessage !== undefined ? { internalMessage: input.internalMessage } : {}),
			...(input.fields !== undefined ? { fields: input.fields } : {})
		})
		.where(eq(schema.reviews.id, review.id));
}
