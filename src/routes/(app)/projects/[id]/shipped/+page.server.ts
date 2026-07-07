// The post-ship celebration. Only makes sense right after shipping - anyone
// wandering here with no ship in review gets bounced to the project page.
import { redirect } from '@sveltejs/kit';
import { requireProject } from '$lib/server/projects';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const project = await requireProject(params.id, locals.user!);
	if (project.shipStatus !== 'pending' && project.shipStatus !== 'pending_hq') {
		redirect(302, `/projects/${project.id}`);
	}

	return { project: { id: project.id, title: project.title } };
};
