// The ship action: snapshot hours + project fields, open a pending ship.
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { createLogger } from '$lib/log';
import { db, schema } from '../db';
import { audit } from '../audit';
import { feedShip } from '../services/slackFeed';
import { getKeySeconds, getTrustLevel } from '../services/hackatime';
import { absoluteUrl } from '../services/storage';
import { MIN_SHIP_SECONDS } from '$lib/config/season';
import type { Project, User } from '../db/schema';
import { hackatimeIdentity, latestApprovedShip, projectKeys } from './queries';
import { shipWindow, windowSeconds } from './windows';

const log = createLogger('ships');

export class ShipError extends Error {}

export async function createShip(project: Project, user: User): Promise<{ shipId: number }> {
	if (project.locked) throw new ShipError('this project was hard-rejected and cannot re-ship');

	if (!user.yswsEligible) throw new ShipError('identity verification must clear before you can ship');

	const ident = hackatimeIdentity(user);
	if (!ident) throw new ShipError('connect Hackatime before shipping');

	// refresh trust inline - "red" (convicted) blocks shipping
	const trust = await getTrustLevel(ident);
	await db()
		.update(schema.users)
		.set({ hackatimeTrustLevel: trust, trustCheckedAt: new Date() })
		.where(eq(schema.users.id, user.id));

	if (trust === 'red') throw new ShipError('your Hackatime account is flagged - reach out to staff');

	// one in-flight ship per project
	const inFlight = await db()
		.select({ id: schema.ships.id })
		.from(schema.ships)
		.where(and(eq(schema.ships.projectId, project.id), inArray(schema.ships.status, ['pending', 'pending_hq'])))
		.limit(1);

	if (inFlight.length > 0) throw new ShipError('a ship is already in review for this project');

	const keys = await projectKeys(project.id);
	if (keys.length === 0) throw new ShipError('link at least one Hackatime project first');

	const now = new Date();
	const approved = await latestApprovedShip(project.id);
	const window = shipWindow(approved?.windowEnd ?? null, now);

	// ship-time snapshot ALWAYS bypasses the cache - this becomes immutable
	const keySeconds = await getKeySeconds(ident, keys, window.start, window.end, { fresh: true });
	const seconds = windowSeconds(keySeconds);
	if (seconds < MIN_SHIP_SECONDS) {
		throw new ShipError(
			`need at least ${Math.round(MIN_SHIP_SECONDS / 60)} tracked minutes in this window (have ${Math.round(seconds / 60)})`
		);
	}

	return await db().transaction(async (tx) => {
		const [prev] = await tx
			.select({ n: schema.ships.shipNumber })
			.from(schema.ships)
			.where(eq(schema.ships.projectId, project.id))
			.orderBy(desc(schema.ships.shipNumber))
			.limit(1);

		const [ship] = await tx
			.insert(schema.ships)
			.values({
				projectId: project.id,
				userId: user.id,
				shipNumber: (prev?.n ?? 0) + 1,
				status: 'pending',
				windowStart: window.start,
				windowEnd: window.end,
				secondsSubmitted: seconds,
				keySeconds,
				snapTitle: project.title,
				snapDescription: project.description,
				snapDemoUrl: project.demoUrl,
				snapRepoUrl: project.repoUrl,
				snapScreenshotUrl: absoluteUrl(project.screenshotKey)
			})
			.returning();

		await tx.update(schema.projects).set({ shipStatus: 'pending' }).where(eq(schema.projects.id, project.id));

		feedShip(user, project.title, ship.shipNumber, seconds);
		log.info('ship created', {
			userId: user.id,
			projectId: project.id,
			shipId: ship.id,
			shipNumber: ship.shipNumber,
			seconds,
			keys: keys.length
		});
		audit({
			actorType: 'user',
			actorId: user.id,
			action: 'ship.create',
			entityType: 'ship',
			entityId: ship.id,
			data: { projectId: project.id, shipNumber: ship.shipNumber, seconds }
		});

		return { shipId: ship.id };
	});
}

/**
 * Cancel a PENDING ship (e.g. to fix metadata and re-ship - the hour window
 * is unaffected, so no tracked time is lost). Ships a reviewer has already
 * approved (pending_hq) can't be pulled back from under them.
 */
export async function cancelShip(project: Project, user: User): Promise<void> {
	const [ship] = await db()
		.select()
		.from(schema.ships)
		.where(and(eq(schema.ships.projectId, project.id), eq(schema.ships.status, 'pending')))
		.orderBy(desc(schema.ships.shipNumber))
		.limit(1);

	if (!ship) {
		if (project.shipStatus === 'pending_hq') {
			throw new ShipError("a reviewer already approved this ship - it can't be cancelled now");
		}

		throw new ShipError('no pending ship to cancel');
	}

	await db().transaction(async (tx) => {
		await tx
			.update(schema.ships)
			.set({ status: 'cancelled', decidedAt: new Date() })
			.where(eq(schema.ships.id, ship.id));

		// the project mirror falls back to the latest non-cancelled ship
		const [latest] = await tx
			.select({ status: schema.ships.status })
			.from(schema.ships)
			.where(and(eq(schema.ships.projectId, project.id), ne(schema.ships.status, 'cancelled')))
			.orderBy(desc(schema.ships.shipNumber))
			.limit(1);
		// `latest` excludes cancelled rows, so this narrowing never fires -
		// it just proves it to the type system
		const fallback = latest && latest.status !== 'cancelled' ? latest.status : 'draft';
		await tx.update(schema.projects).set({ shipStatus: fallback }).where(eq(schema.projects.id, project.id));
	});

	audit({
		actorType: 'user',
		actorId: user.id,
		action: 'ship.cancel',
		entityType: 'ship',
		entityId: ship.id,
		data: { projectId: project.id, shipNumber: ship.shipNumber }
	});
}
