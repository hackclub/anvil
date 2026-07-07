// Owner-only live hours poll for the project page.
import { error, json } from '@sveltejs/kit';
import { requireProject } from '$lib/server/projects';
import { currentWindow, hackatimeIdentity, projectKeys } from '$lib/server/ships/queries';
import { getKeySeconds } from '$lib/server/services/hackatime';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401);

	const project = await requireProject(params.id, locals.user);
	const ident = hackatimeIdentity(locals.user);
	if (!ident) return json({ keySeconds: [], totalSeconds: 0 });

	const keys = await projectKeys(project.id);
	const window = await currentWindow(project.id);
	const keySeconds = await getKeySeconds(ident, keys, window.start, window.end);
	return json({
		keySeconds,
		totalSeconds: keySeconds.reduce((a, k) => a + k.seconds, 0),
		windowStart: window.start.toISOString()
	});
};
