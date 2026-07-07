// Source lifecycle helpers used by project actions. Sources are fully
// AUTOMATIC: inferred from the project's repo + demo links (no manual
// add/remove UI) - a registry demo link (npm/pypi/crates/web store/AMO)
// becomes a downloads/installs source, the repo becomes the stars source.
import { and, eq, inArray, isNull, ne, notInArray } from 'drizzle-orm';
import { db, schema } from '../../db';
import type { Project } from '../../db/schema';
import { recomputeScore } from '../../economy/score';
import { FETCHERS } from './fetchers';
import { githubRef } from './types';

/** The GitHub star source is auto-managed from the project's repo URL. */
export async function ensureGithubSource(project: Project): Promise<void> {
	const ref = githubRef(project.repoUrl);
	// drop stale auto-sources that no longer match the repo url
	await db()
		.delete(schema.tractionSources)
		.where(
			and(
				eq(schema.tractionSources.projectId, project.id),
				eq(schema.tractionSources.kind, 'github_repo'),
				...(ref ? [ne(schema.tractionSources.externalRef, ref)] : [])
			)
		);

	if (ref) {
		await db()
			.insert(schema.tractionSources)
			.values({ projectId: project.id, kind: 'github_repo', externalRef: ref, verified: true })
			.onConflictDoNothing();
	}
}

export async function addSource(
	project: Project,
	kind: string,
	externalRef: string
): Promise<{ error?: string; verified?: boolean }> {
	const fetcher = FETCHERS[kind];
	if (!fetcher) return { error: 'unknown source kind' };

	const ref = externalRef.trim();
	if (!ref) return { error: 'package/extension identifier is required' };

	const validation = await fetcher.validate(ref, project.repoUrl);
	if (!validation.ok) return { error: validation.reason ?? 'source not found' };

	await db()
		.insert(schema.tractionSources)
		.values({
			projectId: project.id,
			kind: kind as never,
			externalRef: ref,
			verified: validation.verified
		})
		.onConflictDoNothing();

	return { verified: validation.verified };
}

export async function removeSource(project: Project, sourceId: string): Promise<void> {
	await db()
		.delete(schema.tractionSources)
		.where(and(eq(schema.tractionSources.id, sourceId), eq(schema.tractionSources.projectId, project.id)));
}

/** kind + ref a registry/store demo URL implies, if any. */
export function inferFromDemoUrl(demoUrl: string | null): { kind: string; ref: string } | null {
	if (!demoUrl) return null;

	let u: URL;
	try {
		u = new URL(demoUrl);
	} catch {
		return null;
	}

	const host = u.hostname.toLowerCase().replace(/^www\./, '');
	const seg = u.pathname.split('/').filter(Boolean);
	// npmjs.com/package/<name> (scoped: /package/@scope/name)
	if (host === 'npmjs.com' && seg[0] === 'package' && seg[1]) {
		return { kind: 'npm', ref: decodeURIComponent(seg.slice(1).join('/')) };
	}

	if (host === 'pypi.org' && seg[0] === 'project' && seg[1]) {
		return { kind: 'pypi', ref: seg[1] };
	}

	if (host === 'crates.io' && seg[0] === 'crates' && seg[1]) {
		return { kind: 'crates', ref: seg[1] };
	}

	// chromewebstore.google.com/detail/<slug>/<id> (id = 32 chars a-p)
	if (host === 'chromewebstore.google.com' || host === 'chrome.google.com') {
		const id = seg.find((p) => /^[a-p]{32}$/.test(p));
		if (id) return { kind: 'chrome_ext', ref: id };
	}

	// addons.mozilla.org/<locale>/firefox/addon/<slug>
	if (host === 'addons.mozilla.org') {
		const i = seg.indexOf('addon');
		if (i >= 0 && seg[i + 1]) return { kind: 'firefox_addon', ref: seg[i + 1] };
	}

	return null;
}

/** First fetch for never-polled sources, so stars/downloads show up right
 *  away instead of waiting for the cron poller. lastPolledAt is set even on
 *  failure so a broken ref can't turn page loads into a retry hammer. */
async function pollFreshSources(projectId: number): Promise<void> {
	const fresh = await db()
		.select()
		.from(schema.tractionSources)
		.where(and(eq(schema.tractionSources.projectId, projectId), isNull(schema.tractionSources.lastPolledAt)));

	let touched = false;
	for (const source of fresh) {
		const fetcher = FETCHERS[source.kind];
		if (!fetcher) continue;

		try {
			const result = await fetcher.fetch(source.externalRef);
			await db().insert(schema.tractionSnapshots).values({ sourceId: source.id, value: result.value, raw: result.raw });

			await db()
				.update(schema.tractionSources)
				.set({ lastValue: result.value, lastPolledAt: new Date(), errorCount: 0 })
				.where(eq(schema.tractionSources.id, source.id));

			touched = true;
		} catch {
			await db()
				.update(schema.tractionSources)
				.set({ errorCount: source.errorCount + 1, lastPolledAt: new Date() })
				.where(eq(schema.tractionSources.id, source.id));
		}
	}

	if (touched) {
		await recomputeScore(projectId);
	}
}

/** Sync ALL auto-inferred sources (repo -> stars, demo -> downloads). */
export async function ensureInferredSources(project: Project): Promise<void> {
	await ensureGithubSource(project);

	const inferred = inferFromDemoUrl(project.demoUrl);
	const registryKinds = ['npm', 'pypi', 'crates', 'chrome_ext', 'firefox_addon'];

	// drop stale inferred sources that no longer match the demo url
	await db()
		.delete(schema.tractionSources)
		.where(
			and(
				eq(schema.tractionSources.projectId, project.id),
				inArray(schema.tractionSources.kind, registryKinds as never[]),
				...(inferred ? [notInArray(schema.tractionSources.externalRef, [inferred.ref])] : [])
			)
		);

	if (!inferred) {
		await pollFreshSources(project.id);
		return;
	}

	// already tracked -> nothing to do (keeps page loads network-free)
	const [existing] = await db()
		.select({ id: schema.tractionSources.id })
		.from(schema.tractionSources)
		.where(
			and(
				eq(schema.tractionSources.projectId, project.id),
				eq(schema.tractionSources.kind, inferred.kind as never),
				eq(schema.tractionSources.externalRef, inferred.ref)
			)
		);

	if (existing) {
		await pollFreshSources(project.id);
		return;
	}

	// registry metadata must point at the project's repo to count as verified
	// (anti-abuse) - unverified sources score 0 until staff verify in admin
	let verified = false;
	try {
		const validation = await FETCHERS[inferred.kind]?.validate(inferred.ref, project.repoUrl);
		if (validation && !validation.ok) {
			await pollFreshSources(project.id);
			return; // package doesn't exist - skip
		}

		verified = validation?.verified ?? false;
	} catch {
		// registry hiccup - track unverified, the poller sorts it out
	}

	await db()
		.insert(schema.tractionSources)
		.values({
			projectId: project.id,
			kind: inferred.kind as never,
			externalRef: inferred.ref,
			verified
		})
		.onConflictDoNothing();

	await pollFreshSources(project.id);
}
