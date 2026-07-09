import { redirect } from '@sveltejs/kit';
import { authorizationUrl, generateState } from '$lib/server/auth/hca';
import { safeNext } from '$lib/server/auth/redirect';
import { createLogger } from '$lib/log';
import type { RequestHandler } from './$types';

const log = createLogger('auth');

export const GET: RequestHandler = ({ cookies, url, locals }) => {
	if (locals.user) redirect(302, '/dashboard');

	log.info('login started', { hasNext: !!url.searchParams.get('next') });

	const state = generateState();
	cookies.set('hca_oauth_state', state, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 600
	});

	const next = url.searchParams.get('next');
	// only persist a genuinely same-origin path (blocks //evil.com etc.)
	if (next && safeNext(next) === next) {
		cookies.set('hca_oauth_next', next, { path: '/', httpOnly: true, secure: true, maxAge: 600 });
	}

	redirect(302, authorizationUrl(state, url.origin).toString());
};
