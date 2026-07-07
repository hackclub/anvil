import { fail, redirect } from '@sveltejs/kit';
import { requireProject } from '$lib/server/projects';
import { preflight } from '$lib/server/ships/preflight';
import { createShip, ShipError } from '$lib/server/ships/ship';
import { currentWindow, hackatimeIdentity, projectKeys } from '$lib/server/ships/queries';
import { getKeySeconds } from '$lib/server/services/hackatime';
import { publicUrl } from '$lib/server/services/storage';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user!;
	const project = await requireProject(params.id, user);

	let totalSeconds = 0;
	const ident = hackatimeIdentity(user);
	if (ident) {
		try {
			const keys = await projectKeys(project.id);
			const window = await currentWindow(project.id);
			const perKey = await getKeySeconds(ident, keys, window.start, window.end);
			totalSeconds = perKey.reduce((a, k) => a + k.seconds, 0);
		} catch {
			// the ship action re-checks with a fresh read anyway
		}
	}

	const result = await preflight(project);

	return {
		project: {
			id: project.id,
			title: project.title,
			description: project.description,
			repoUrl: project.repoUrl,
			demoUrl: project.demoUrl,
			screenshotUrl: publicUrl(project.screenshotKey)
		},
		totalSeconds,
		checks: result.checks,
		blocked: result.errors.length > 0
	};
};

export const actions: Actions = {
	confirm: async ({ locals, params }) => {
		const user = locals.user!;
		const project = await requireProject(params.id, user);

		// authoritative re-run - the review page is advisory, this one counts
		const result = await preflight(project);
		if (result.errors.length > 0) {
			return fail(400, {
				error: `fix the problems first: ${result.errors.map((e) => e.label).join(', ')}`
			});
		}

		try {
			await createShip(project, user);
		} catch (err) {
			if (err instanceof ShipError) return fail(400, { error: err.message });

			throw err;
		}
		// straight into the celebration - fanfare, implosion, the works
		redirect(303, `/projects/${project.id}/shipped`);
	}
};
