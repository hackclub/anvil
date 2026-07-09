import { error, redirect } from '@sveltejs/kit';
import { exchangeCode, fetchMe, upsertUserFromLogin } from '$lib/server/auth/hca';
import { createSession } from '$lib/server/auth/session';
import { safeNext } from '$lib/server/auth/redirect';
import { ensureHackatimeLinked } from '$lib/server/services/hackatimeLink';
import { createLogger } from '$lib/log';
import type { RequestHandler } from './$types';

const log = createLogger('auth');

export const GET: RequestHandler = async ({ cookies, url, request, getClientAddress }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('hca_oauth_state');
	cookies.delete('hca_oauth_state', { path: '/' });

	if (!code || !state || !storedState || state !== storedState) {
		log.warn('oauth callback rejected: state mismatch', {
			hasCode: !!code,
			hasState: !!state,
			hasStoredState: !!storedState
		});
		error(400, 'invalid oauth state - please try signing in again');
	}

	const tokens = await exchangeCode(code, url.origin);
	const me = await fetchMe(tokens.accessToken);
	const user = await upsertUserFromLogin(me, tokens);

	if (user.isBanned) {
		log.warn('banned account blocked at login', { userId: user.id });
		error(403, 'this account is banned from Anvil');
	}

	// auto-link Hackatime from the slack id / email HCA just gave us
	try {
		await ensureHackatimeLinked(user);
	} catch (err) {
		log.warn('hackatime auto-link failed (retryable from the project page)', {
			err,
			capture: false,
			userId: user.id
		});
	}

	log.info('login', { userId: user.id, username: user.username });

	await createSession(
		user.id,
		{ ip: getClientAddress(), userAgent: request.headers.get('user-agent') ?? undefined },
		cookies
	);

	const next = cookies.get('hca_oauth_next');
	cookies.delete('hca_oauth_next', { path: '/' });
	// re-validate on the way out - defends even if a bad value reached the cookie
	redirect(302, safeNext(next));
};
