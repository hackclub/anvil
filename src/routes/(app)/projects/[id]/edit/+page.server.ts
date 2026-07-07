import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '$lib/server/db';
import { requireProject } from '$lib/server/projects';
import { hackatimeIdentity, projectKeys } from '$lib/server/ships/queries';
import { listUserProjects } from '$lib/server/services/hackatime';
import { deleteUpload, publicUrl, storeUpload, UploadError } from '$lib/server/services/storage';
import { ensureInferredSources } from '$lib/server/services/traction/manage';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

const projectSchema = z.object({
	title: z.string().trim().min(1, 'title is required').max(80),
	description: z.string().trim().max(2000).default(''),
	demoUrl: z.union([z.literal(''), z.url()]).default(''),
	repoUrl: z.union([z.literal(''), z.url()]).default('')
});

export const load: PageServerLoad = async ({ locals, params }) => {
	const project = await requireProject(params.id, locals.user!);

	const keys = await projectKeys(project.id);
	const ident = hackatimeIdentity(locals.user!);
	let availableKeys: { name: string; total_seconds: number }[] = [];
	if (ident) {
		try {
			availableKeys = await listUserProjects(ident);
		} catch {
			// hackatime hiccup - key management just shows linked keys
		}
	}

	// linked keys that hackatime no longer reports still need to be unlinkable
	for (const k of keys) {
		if (!availableKeys.some((ak) => ak.name === k)) {
			availableKeys.push({ name: k, total_seconds: 0 });
		}
	}

	// hackatime keys feeding the user's OTHER projects (struck out in the list)
	const otherLinks = await db()
		.select({
			key: schema.hackatimeProjectLinks.hackatimeKey,
			title: schema.projects.title
		})
		.from(schema.hackatimeProjectLinks)
		.innerJoin(schema.projects, eq(schema.hackatimeProjectLinks.projectId, schema.projects.id))
		.where(
			and(
				eq(schema.hackatimeProjectLinks.userId, locals.user!.id),
				ne(schema.hackatimeProjectLinks.projectId, project.id),
				isNull(schema.projects.deletedAt)
			)
		);

	const assignedElsewhere = Object.fromEntries(otherLinks.map((l) => [l.key, l.title]));

	return {
		project: {
			id: project.id,
			title: project.title,
			description: project.description,
			demoUrl: project.demoUrl ?? '',
			repoUrl: project.repoUrl ?? '',
			screenshotUrl: publicUrl(project.screenshotKey)
		},
		keys,
		availableKeys,
		assignedElsewhere
	};
};

export const actions: Actions = {
	update: async ({ locals, params, request }) => {
		const project = await requireProject(params.id, locals.user!);
		const form = await request.formData();
		const parsed = projectSchema.safeParse({
			title: String(form.get('title') ?? ''),
			description: String(form.get('description') ?? ''),
			demoUrl: String(form.get('demoUrl') ?? ''),
			repoUrl: String(form.get('repoUrl') ?? '')
		});

		if (!parsed.success) return fail(400, { error: parsed.error.issues[0].message });

		let screenshotKey = project.screenshotKey;
		const screenshot = form.get('screenshot');
		if (screenshot instanceof File && screenshot.size > 0) {
			if (screenshot.size > 8 * 1024 * 1024) return fail(400, { error: 'screenshot must be ≤8MB' });

			if (!screenshot.type.startsWith('image/')) return fail(400, { error: 'screenshot must be an image' });

			let uploadedKey: string;
			try {
				uploadedKey = (await storeUpload(screenshot, 'screenshots')).key;
			} catch (e) {
				if (e instanceof UploadError) return fail(400, { error: e.message });

				throw e;
			}

			// only drop the old screenshot once the new one is safely stored
			if (screenshotKey) {
				await deleteUpload(screenshotKey);
			}

			screenshotKey = uploadedKey;
		}

		const d = parsed.data;
		await db()
			.update(schema.projects)
			.set({
				title: d.title,
				description: d.description,
				demoUrl: d.demoUrl || null,
				repoUrl: d.repoUrl || null,
				screenshotKey
			})
			.where(eq(schema.projects.id, project.id));

		await ensureInferredSources({
			...project,
			repoUrl: d.repoUrl || null,
			demoUrl: d.demoUrl || null
		});

		redirect(303, `/projects/${project.id}`);
	},

	toggleKey: async ({ locals, params, request }) => {
		const user = locals.user!;
		const project = await requireProject(params.id, user);
		const form = await request.formData();
		const key = String(form.get('key') ?? '');
		if (!key) return fail(400, { error: 'missing hackatime key' });

		const [existing] = await db()
			.select()
			.from(schema.hackatimeProjectLinks)
			.where(and(eq(schema.hackatimeProjectLinks.userId, user.id), eq(schema.hackatimeProjectLinks.hackatimeKey, key)));

		if (existing) {
			if (existing.projectId !== project.id) {
				return fail(400, { error: `"${key}" is already linked to another project` });
			}

			await db().delete(schema.hackatimeProjectLinks).where(eq(schema.hackatimeProjectLinks.id, existing.id));
		} else {
			await db()
				.insert(schema.hackatimeProjectLinks)
				.values({ userId: user.id, projectId: project.id, hackatimeKey: key })
				.onConflictDoNothing();
		}

		audit({
			actorType: 'user',
			actorId: user.id,
			action: existing ? 'project.unlink_key' : 'project.link_key',
			entityType: 'project',
			entityId: project.id,
			data: { key }
		});

		return { toggled: true };
	},

	delete: async ({ locals, params }) => {
		const project = await requireProject(params.id, locals.user!);
		// projects with any ship history are never hard-deleted (audit trail)
		// prettier-ignore
		await db()
			.update(schema.projects)
			.set({ deletedAt: new Date() })
			.where(eq(schema.projects.id, project.id));

		audit({
			actorType: 'user',
			actorId: locals.user!.id,
			action: 'project.delete',
			entityType: 'project',
			entityId: project.id,
			data: { title: project.title }
		});

		redirect(303, '/dashboard');
	}
};
