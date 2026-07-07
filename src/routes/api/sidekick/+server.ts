// The Sidekick protocol endpoint: one POST, bearer-authed with a shared
// secret, JSON { action, input }. All logic lives in sidekick/dispatch.ts.
import { json } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { dispatch } from '$lib/server/sidekick/dispatch';
import { SidekickError } from '$lib/server/sidekick/reviewActions';
import { optional } from '$lib/server/env';
import type { RequestHandler } from './$types';

function authorized(header: string | null): boolean {
	const secret = optional('SIDEKICK_SECRET');
	if (!secret) return false;

	const token = header?.replace(/^Bearer /, '') ?? '';
	const a = Buffer.from(token);
	const b = Buffer.from(secret);
	return a.length === b.length && timingSafeEqual(a, b);
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!authorized(request.headers.get('authorization'))) {
		return json({ error: 'UNAUTHORIZED', message: 'Invalid secret.' }, { status: 401 });
	}

	let body: { action?: unknown; input?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'VALIDATION_ERROR', message: 'Body must be JSON.' }, { status: 400 });
	}

	if (typeof body.action !== 'string' || (body.input !== undefined && typeof body.input !== 'object')) {
		return json({ error: 'VALIDATION_ERROR', message: 'Expected { action: string, input: object }.' }, { status: 400 });
	}

	const input = { ...((body.input as Record<string, unknown>) ?? {}) };
	if (body.action === 'REVEAL_ORDER_ADDRESS') {
		input.__requestIp = getClientAddress();
	}

	try {
		return json(await dispatch(body.action, input));
	} catch (err) {
		if (err instanceof SidekickError) {
			const status = err.code === 'NOT_FOUND' ? 404 : 400;
			return json({ error: err.code, message: err.message }, { status });
		}

		console.error('[sidekick] internal error:', err);
		return json({ error: 'INTERNAL_ERROR', message: 'Something broke on our side.' }, { status: 500 });
	}
};
