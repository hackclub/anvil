import { redirect } from '@sveltejs/kit';
import { destroySession, SESSION_COOKIE } from '$lib/server/auth/session';
import { createLogger } from '$lib/log';
import type { RequestHandler } from './$types';

const log = createLogger('auth');

export const POST: RequestHandler = async ({ cookies, locals }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) {
		await destroySession(token, cookies);
	}

	log.info('logout', { userId: locals.user?.id ?? null });
	redirect(302, '/');
};
