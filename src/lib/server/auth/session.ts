// DB-backed sessions. The cookie holds a random token; we store only its
// sha256, so a database leak doesn't hand out usable sessions.
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { db, schema } from '../db';
import type { User } from '../db/schema';

export const SESSION_COOKIE = 'anvil_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // sliding 30 days
const EXTEND_AFTER_MS = 24 * 60 * 60 * 1000; // touch at most daily

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
	userId: number,
	meta: { ip?: string; userAgent?: string },
	cookies: Cookies
): Promise<void> {
	const token = randomBytes(32).toString('base64url');
	await db()
		.insert(schema.sessions)
		.values({
			tokenHash: hashToken(token),
			userId,
			expiresAt: new Date(Date.now() + SESSION_TTL_MS),
			ip: meta.ip,
			userAgent: meta.userAgent
		});

	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: SESSION_TTL_MS / 1000
	});
}

export async function resolveSession(token: string): Promise<{ user: User; sessionId: string } | null> {
	const rows = await db()
		.select()
		.from(schema.sessions)
		.innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
		.where(eq(schema.sessions.tokenHash, hashToken(token)))
		.limit(1);

	const row = rows[0];
	if (!row) return null;

	const session = row.sessions;
	const user = row.users;
	if (session.expiresAt.getTime() < Date.now()) {
		await db().delete(schema.sessions).where(eq(schema.sessions.id, session.id));
		return null;
	}

	if (user.deletedAt || user.isBanned) return null;

	// sliding expiry, extended at most once a day to avoid a write per request
	const remaining = session.expiresAt.getTime() - Date.now();
	if (SESSION_TTL_MS - remaining > EXTEND_AFTER_MS) {
		await db()
			.update(schema.sessions)
			.set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
			.where(eq(schema.sessions.id, session.id));
	}

	return { user, sessionId: session.id };
}

export async function destroySession(token: string, cookies: Cookies): Promise<void> {
	await db()
		.delete(schema.sessions)
		.where(eq(schema.sessions.tokenHash, hashToken(token)));

	cookies.delete(SESSION_COOKIE, { path: '/' });
}
