import { sequence } from '@sveltejs/kit/hooks';
import * as Sentry from '@sentry/sveltekit';
import { error, type Handle, type HandleServerError, type ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { resolveSession, SESSION_COOKIE } from '$lib/server/auth/session';
import { optional } from '$lib/server/env';
import { startJobs } from '$lib/server/jobs';
import { createLogger } from '$lib/log';
import '$lib/server/jobs/register';

const log = createLogger('http');
const bootLog = createLogger('init');

// Boot background jobs with the server (skipped while prerendering the
// marketing pages at build time, and in DB-less marketing-only mode).
export const init: ServerInit = async () => {
	if (building) return;

	bootLog.info('server starting', { hasDb: !!optional('DATABASE_URL'), node: process.version });
	try {
		await startJobs();
	} catch (err) {
		bootLog.exception('failed to start jobs', err);
	}
};

export const handle: Handle = sequence(Sentry.sentryHandle(), async ({ event, resolve }) => {
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
				log.debug('stale session cookie cleared', { path: event.url.pathname });
				event.cookies.delete(SESSION_COOKIE, { path: '/' });
			}
		} catch (err) {
			log.exception('session resolution failed', err, { path: event.url.pathname });
		}
	}

	// Tie every log/error on this request to the acting user, in Sentry.
	if (event.locals.user) {
		Sentry.setUser({ id: String(event.locals.user.id), username: event.locals.user.username ?? undefined });
	} else {
		Sentry.setUser(null);
	}

	if (event.url.pathname.startsWith('/admin') && !event.locals.user?.isAdmin) {
		log.warn('admin route blocked', {
			path: event.url.pathname,
			userId: event.locals.user?.id ?? null
		});
		error(404, 'Not Found');
	}

	// Request lifecycle log - one line per request covers EVERY server route
	// (pages, actions, endpoints) without per-file instrumentation. The health
	// check is skipped so it doesn't drown the logs every few seconds.
	const start = performance.now();
	const isHealth = event.url.pathname === '/healthz';
	try {
		const response = await resolve(event);
		if (!isHealth) {
			const ms = Math.round(performance.now() - start);
			const data = {
				method: event.request.method,
				path: event.url.pathname,
				status: response.status,
				ms,
				userId: event.locals.user?.id ?? null
			};
			// slow (>1s) requests get a nudge; the rest is routine info. (5xx is
			// surfaced by handleError, which has the actual error to attach.)
			if (ms > 1000) log.warn('slow request', data);
			else log.info('request', data);
		}

		return response;
	} catch (err) {
		// A throw here becomes a 500 via handleError; log the routing context too.
		log.exception('request threw', err, {
			method: event.request.method,
			path: event.url.pathname,
			userId: event.locals.user?.id ?? null
		});
		throw err;
	}
});

// handleErrorWithSentry reports the exception to Sentry as an Issue, then calls
// this handler - which mirrors it to our console/structured-log pipeline with
// the route + user context Sentry's default doesn't print to stdout.
// capture:false avoids re-capturing what Sentry already sent.
export const handleError = Sentry.handleErrorWithSentry((input: Parameters<HandleServerError>[0]) => {
	const { error: err, event, status, message } = input;
	// 404s are routine noise; everything else is a real server-side failure.
	if (status !== 404) {
		log.error('unhandled server error', {
			err,
			capture: false,
			path: event.url.pathname,
			status,
			message,
			userId: event.locals?.user?.id ?? null
		});
	}
});
