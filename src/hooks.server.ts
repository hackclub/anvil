import { error, type Handle, type ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { resolveSession, SESSION_COOKIE } from '$lib/server/auth/session';
import { optional } from '$lib/server/env';
import { startJobs } from '$lib/server/jobs';
import '$lib/server/jobs/register';

// Boot background jobs with the server (skipped while prerendering the
// marketing pages at build time, and in DB-less marketing-only mode).
export const init: ServerInit = async () => {
	if (building) return;

	try {
		await startJobs();
	} catch (err) {
		console.error('[init] failed to start jobs:', err);
	}
};

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.sessionId = null;

	// Marketing pages + the Sidekick endpoint (bearer-authed in-route) don't need a session; everything else resolves the cookie if present.
	const token = event.cookies.get(SESSION_COOKIE);
	if (token && !building && optional('DATABASE_URL')) {
		try {
			const resolved = await resolveSession(token);
			if (resolved) {
				event.locals.user = resolved.user;
				event.locals.sessionId = resolved.sessionId;
			} else {
				event.cookies.delete(SESSION_COOKIE, { path: '/' });
			}
		} catch (err) {
			console.error('[hooks] session resolution failed:', err);
		}
	}

	if (event.url.pathname.startsWith('/admin') && !event.locals.user?.isAdmin) {
		error(404, 'Not Found');
	}

	return resolve(event);
};
