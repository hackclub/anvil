import { redirect } from '@sveltejs/kit';
import { authorizationUrl, generateState } from '$lib/server/auth/hca';
import { safeNext } from '$lib/server/auth/redirect';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies, url, locals }) => {
	if (locals.user) redirect(302, '/dashboard');

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

	redirect(302, authorizationUrl(state).toString());
};
