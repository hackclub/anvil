// Pre-ship checks: every field set, repo public + reachable, demo reachable,
// README real (not a starter template). Errors BLOCK shipping; warnings are
// shown but let the ship through (e.g. video demo links).
import { githubRef } from '../services/traction/types';
import { optional } from '../env';
import type { Project } from '../db/schema';

export interface ShipCheck {
	id: string;
	label: string;
	level: 'error' | 'warn';
	ok: boolean;
	detail: string;
}

export interface PreflightResult {
	checks: ShipCheck[];
	/** blocking problems (failed error-level checks) */
	errors: ShipCheck[];
	warnings: ShipCheck[];
}

// ── pure helpers (unit-testable) ──────────────────────────────────────────

const TEMPLATE_HEADINGS = [
	'# sv',
	'# astro starter kit: basics',
	'# nuxt minimal starter',
	'# welcome to react router!',
	'# getting started with create react app'
];

/** Returns a problem description, or null when the README looks hand-written. */
export function analyzeReadme(md: string): string | null {
	const lines = md
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);

	if (lines.length === 0) return 'the README is empty';

	const headings = lines.filter((l) => /^#{1,6}\s|^#$|^#\S/.test(l));
	const firstHeading = headings[0]?.toLowerCase().replace(/\s+/g, ' ').trim();

	if (firstHeading && TEMPLATE_HEADINGS.includes(firstHeading)) {
		return 'this looks like an auto-generated starter README - write your own!';
	}

	if (headings.some((h) => h.toLowerCase().trimEnd().endsWith('+ vite'))) {
		return 'this looks like an auto-generated "+ Vite" template README - write your own!';
	}

	if (headings.length === 1 && lines.length === 1) {
		return 'the README is just a single heading - tell people what your project does!';
	}

	return null;
}

/** Video-ish demo links get a warning: most projects can be deployed instead. */
export function isVideoLink(url: string): boolean {
	const u = url.toLowerCase();
	if (/\.(mp4|mov|webm|avi|mkv|m4v|gif)(\?|#|$)/.test(u)) return true;

	return /youtube\.com\/(watch|shorts)|youtu\.be\/|vimeo\.com\/|loom\.com\/share|streamable\.com\//.test(u);
}

// ── network checks ────────────────────────────────────────────────────────

async function fetchStatus(url: string): Promise<{ ok: boolean; detail: string }> {
	try {
		const res = await fetch(url, {
			method: 'GET',
			redirect: 'follow',
			signal: AbortSignal.timeout(8000),
			headers: { 'User-Agent': 'anvil.hackclub.com preflight' }
		});

		if (res.ok) return { ok: true, detail: `reachable (HTTP ${res.status})` };

		return { ok: false, detail: `returned HTTP ${res.status} - it must be public and working` };
	} catch {
		return { ok: false, detail: "couldn't be reached at all - is the link right?" };
	}
}

async function fetchReadme(repoUrl: string): Promise<{ found: boolean; content: string } | null> {
	const ref = githubRef(repoUrl);
	if (!ref) return null;

	// not github - can't check reliably, skip
	try {
		const token = optional('GITHUB_TOKEN');
		const res = await fetch(`https://api.github.com/repos/${ref}/readme`, {
			headers: {
				Accept: 'application/vnd.github.raw+json',
				'User-Agent': 'anvil.hackclub.com preflight',
				...(token ? { Authorization: `Bearer ${token}` } : {})
			},
			signal: AbortSignal.timeout(8000)
		});

		if (!res.ok) return { found: false, content: '' };

		return { found: true, content: await res.text() };
	} catch {
		return { found: false, content: '' };
	}
}

// ── the preflight ─────────────────────────────────────────────────────────

export async function preflight(project: Project): Promise<PreflightResult> {
	const checks: ShipCheck[] = [];
	const push = (c: ShipCheck) => checks.push(c);

	// 1. every field must be set
	push({
		id: 'field:description',
		label: 'description',
		level: 'error',
		ok: project.description.trim().length > 0,
		detail: project.description.trim() ? 'set' : 'missing - in a few sentences, describe what it does!'
	});

	push({
		id: 'field:repo',
		label: 'repo link',
		level: 'error',
		ok: !!project.repoUrl,
		detail: project.repoUrl ? 'set' : 'missing - usually a Git repo!'
	});

	push({
		id: 'field:demo',
		label: 'demo link',
		level: 'error',
		ok: !!project.demoUrl,
		detail: project.demoUrl ? 'set' : 'missing - a deployed, live version of your project'
	});

	push({
		id: 'field:screenshot',
		label: 'screenshot',
		level: 'error',
		ok: !!project.screenshotKey,
		detail: project.screenshotKey ? 'set' : "missing - a screenshot of your project in action! can't be a logo!"
	});

	// 2. repo must be public + reachable, with a real README
	if (project.repoUrl) {
		const repo = await fetchStatus(project.repoUrl);
		push({
			id: 'net:repo',
			label: 'repo is public',
			level: 'error',
			ok: repo.ok,
			detail: repo.detail
		});

		if (repo.ok) {
			const readme = await fetchReadme(project.repoUrl);
			if (readme === null) {
				push({
					id: 'readme',
					label: 'README',
					level: 'error',
					ok: true,
					detail: 'skipped (not a github repo - reviewers will check by hand)'
				});
			} else if (!readme.found) {
				push({
					id: 'readme',
					label: 'README',
					level: 'error',
					ok: false,
					detail: 'no README.md found - every good project has one!'
				});
			} else {
				const problem = analyzeReadme(readme.content);
				push({
					id: 'readme',
					label: 'README',
					level: 'error',
					ok: problem === null,
					detail: problem ?? 'looks hand-written'
				});
			}
		}
	}

	// 3. demo must be reachable; videos get a warning
	if (project.demoUrl) {
		if (isVideoLink(project.demoUrl)) {
			push({
				id: 'demo:video',
				label: 'demo link',
				level: 'warn',
				ok: false,
				detail: 'looks like this is a video! for most projects, you can probably deploy them.'
			});
		} else {
			const demo = await fetchStatus(project.demoUrl);
			push({
				id: 'net:demo',
				label: 'demo is live',
				level: 'error',
				ok: demo.ok,
				detail: demo.detail
			});
		}
	}

	return {
		checks,
		errors: checks.filter((c) => c.level === 'error' && !c.ok),
		warnings: checks.filter((c) => c.level === 'warn' && !c.ok)
	};
}
