import type { Project, Review, Ship, User } from '../db/schema';
import { absoluteUrl } from '../services/storage';

/** Slack ID if we have one, else the HCA id (already "ident!..."-shaped). */
export function actorIdFor(user: User): string {
	return user.slackId ?? user.hcaId;
}

/** Custom review fields we ask Sidekick to render. */
export const REJECT_FIELDS = [
	{
		name: 'hard_reject',
		label: 'Hard reject (permanently lock this project from re-shipping)',
		type: 'boolean',
		required: false,
		defaultValue: false
	}
];

// The protocol types ALL entity ids as strings (Sidekick stores them as
// strings), so integer ids must be stringified at this boundary.
export function serializeShip(ship: Ship) {
	const base = {
		id: String(ship.id),
		hoursSubmitted: Math.round((ship.secondsSubmitted / 3600) * 100) / 100,
		// the moment this (re-)submission happened, from the same DB clock as
		// reviews - NOT windowEnd, which is the hours-window boundary and would
		// misorder the timeline against review timestamps
		submittedAt: ship.createdAt.toISOString(),
		status: ship.status
	};

	if (ship.status === 'pending' || ship.status === 'pending_hq') {
		return { ...base, approveFields: [], rejectFields: REJECT_FIELDS };
	}

	return base;
}

export function serializeProject(project: Project, owner: User, keys: string[], ships: Ship[]) {
	return {
		id: String(project.id),
		title: project.title,
		description: project.description,
		codeUrl: project.repoUrl ?? '',
		demoUrl: project.demoUrl ?? undefined,
		screenshotUrl: absoluteUrl(project.screenshotKey) ?? undefined,
		authorId: actorIdFor(owner),
		hackatimeId: owner.hackatimeId ?? undefined,
		hackatimeProjectKeys: keys,
		ships: ships.map(serializeShip),
		metadata: {
			level: project.level,
			score: project.score,
			locked: project.locked
		}
	};
}

// ── timeline ──────────────────────────────────────────────────────────────

interface ShipChange {
	field: string;
	label: string;
	oldValue: string;
	newValue: string;
	diffType: 'text' | 'url' | 'image';
}

const DIFF_FIELDS: {
	field: string;
	label: string;
	diffType: ShipChange['diffType'];
	pick: (s: Ship) => string;
}[] = [
	{ field: 'title', label: 'Title', diffType: 'text', pick: (s) => s.snapTitle },
	{ field: 'description', label: 'Description', diffType: 'text', pick: (s) => s.snapDescription },
	{ field: 'demoUrl', label: 'Demo URL', diffType: 'url', pick: (s) => s.snapDemoUrl ?? '' },
	{ field: 'codeUrl', label: 'Code URL', diffType: 'url', pick: (s) => s.snapRepoUrl ?? '' },
	{
		field: 'screenshotUrl',
		label: 'Screenshot',
		diffType: 'image',
		pick: (s) => s.snapScreenshotUrl ?? ''
	}
];

export function shipChanges(ship: Ship, prev: Ship | null): ShipChange[] {
	if (!prev) return [];

	const changes: ShipChange[] = [];
	for (const f of DIFF_FIELDS) {
		const oldValue = f.pick(prev);
		const newValue = f.pick(ship);
		if (oldValue !== newValue) {
			changes.push({ field: f.field, label: f.label, oldValue, newValue, diffType: f.diffType });
		}
	}

	return changes;
}

export type TimelineEvent = Record<string, unknown> & { type: string; timestamp: string };

export function shipEvent(ship: Ship, prev: Ship | null, ownerActorId: string): TimelineEvent {
	return {
		type: 'ship',
		shipId: String(ship.id),
		actorId: ownerActorId,
		hoursSubmitted: Math.round((ship.secondsSubmitted / 3600) * 100) / 100,
		changes: shipChanges(ship, prev),
		timestamp: ship.createdAt.toISOString()
	};
}

export function reviewEvent(review: Review): TimelineEvent {
	const ts = review.createdAt.toISOString();
	switch (review.kind) {
		case 'approval':
			return {
				type: 'approval',
				shipId: String(review.shipId),
				actorId: review.reviewerActorId,
				hoursAssigned: review.hoursAssigned ?? 0,
				feedbackMessage: review.feedback ?? '',
				justification: review.justification ?? '',
				fields: review.fields ?? {},
				timestamp: ts
			};
		case 'rejection':
			return {
				type: 'rejection',
				shipId: String(review.shipId),
				actorId: review.reviewerActorId,
				feedbackMessage: review.feedback ?? '',
				internalMessage: review.internalMessage ?? undefined,
				fields: review.fields ?? {},
				timestamp: ts
			};
		default:
			return {
				type: 'comment',
				actorId: review.reviewerActorId,
				message: review.feedback ?? '',
				isInternal: review.kind === 'internal_comment',
				timestamp: ts
			};
	}
}
