// Shared project access helper: owners see their projects, admins see all.
import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from './db';
import type { Project, User } from './db/schema';

export async function requireProject(idParam: string, user: User): Promise<Project> {
	const id = Number(idParam);
	if (!Number.isInteger(id)) error(404, 'project not found');

	const [project] = await db()
		.select()
		.from(schema.projects)
		.where(and(eq(schema.projects.id, id), isNull(schema.projects.deletedAt)))
		.limit(1);

	if (!project) error(404, 'project not found');

	if (project.userId !== user.id && !user.isAdmin) error(404, 'project not found');

	return project;
}
