// Shared ship/window lookups used by pages, the ship action, and Sidekick.
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { User } from '../db/schema';
import type { HackatimeIdentity } from '../services/hackatime';
import { shipWindow, type ShipWindow } from './windows';

/** The identity we query Hackatime with for a given user. */
export function hackatimeIdentity(user: User): HackatimeIdentity | null {
	const id = user.hackatimeId ?? user.slackId;
	if (!id) return null;

	return { id };
}

export async function latestApprovedShip(projectId: number) {
	const [row] = await db()
		.select()
		.from(schema.ships)
		.where(and(eq(schema.ships.projectId, projectId), eq(schema.ships.status, 'approved')))
		.orderBy(desc(schema.ships.windowEnd))
		.limit(1);

	return row ?? null;
}

export async function currentWindow(projectId: number, now = new Date()): Promise<ShipWindow> {
	const approved = await latestApprovedShip(projectId);
	return shipWindow(approved?.windowEnd ?? null, now);
}

export async function projectKeys(projectId: number): Promise<string[]> {
	const rows = await db()
		.select({ key: schema.hackatimeProjectLinks.hackatimeKey })
		.from(schema.hackatimeProjectLinks)
		.where(eq(schema.hackatimeProjectLinks.projectId, projectId));

	return rows.map((r) => r.key);
}
