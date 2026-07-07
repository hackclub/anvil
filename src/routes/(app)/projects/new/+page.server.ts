import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { db, schema } from '$lib/server/db';
import { storeUpload, UploadError } from '$lib/server/services/storage';
import { ensureInferredSources } from '$lib/server/services/traction/manage';
import { audit } from '$lib/server/audit';
import { feedNewProject } from '$lib/server/services/slackFeed';
import type { Actions } from './$types';

const projectSchema = z.object({
	title: z.string().trim().min(1, 'title is required').max(80, 'keep the title under 80 chars'),
	description: z.string().trim().max(2000, 'description is too long').default(''),
	demoUrl: z.union([z.literal(''), z.url('demo link must be a URL')]).default(''),
	repoUrl: z.union([z.literal(''), z.url('repo link must be a URL')]).default('')
});

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const form = await request.formData();
		const parsed = projectSchema.safeParse({
			title: String(form.get('title') ?? ''),
			description: String(form.get('description') ?? ''),
			demoUrl: String(form.get('demoUrl') ?? ''),
			repoUrl: String(form.get('repoUrl') ?? '')
		});

		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0].message });
		}

		let screenshotKey: string | null = null;
		const screenshot = form.get('screenshot');
		if (screenshot instanceof File && screenshot.size > 0) {
			if (screenshot.size > 8 * 1024 * 1024) return fail(400, { error: 'screenshot must be ≤8MB' });

			if (!screenshot.type.startsWith('image/')) return fail(400, { error: 'screenshot must be an image' });

			try {
				screenshotKey = (await storeUpload(screenshot, 'screenshots')).key;
			} catch (e) {
				if (e instanceof UploadError) return fail(400, { error: e.message });

				throw e;
			}
		}

		const d = parsed.data;
		const [project] = await db()
			.insert(schema.projects)
			.values({
				userId: locals.user!.id,
				title: d.title,
				description: d.description,
				demoUrl: d.demoUrl || null,
				repoUrl: d.repoUrl || null,
				screenshotKey
			})
			.returning();

		await ensureInferredSources(project);
		feedNewProject(locals.user!, project.title);
		audit({
			actorType: 'user',
			actorId: locals.user!.id,
			action: 'project.create',
			entityType: 'project',
			entityId: project.id,
			data: { title: parsed.data.title }
		});

		redirect(303, `/projects/${project.id}`);
	}
};
