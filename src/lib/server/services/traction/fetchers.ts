// One fetcher per traction kind. Validation rule: a package/extension source
// only earns SCORE once its registry metadata provably points at the project's
// repo (or staff verify it manually) - this is the main anti-gaming gate.
import { optional } from '../../env';
import { githubRef, repoUrlsMatch, type TractionFetcher, type ValidationResult } from './types';

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
	const res = await fetch(url, { headers: { 'User-Agent': 'anvil.hackclub.com', ...headers } });
	if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);

	return res.json();
}

const github: TractionFetcher = {
	kind: 'github_repo',
	// auto-derived from the project's own repo url - inherently verified
	async validate(ref, projectRepoUrl): Promise<ValidationResult> {
		const expected = githubRef(projectRepoUrl);
		return {
			ok: expected != null,
			verified: expected != null && ref.toLowerCase() === expected.toLowerCase(),
			reason: expected ? undefined : 'project repo is not a github url'
		};
	},
	async fetch(ref) {
		const token = optional('GITHUB_TOKEN');
		const body = (await getJson(
			`https://api.github.com/repos/${ref}`,
			token ? { Authorization: `Bearer ${token}` } : {}
		)) as { stargazers_count: number };

		return { value: body.stargazers_count, raw: { stars: body.stargazers_count } };
	}
};

const npm: TractionFetcher = {
	kind: 'npm',
	async validate(pkg, projectRepoUrl) {
		try {
			const meta = (await getJson(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`)) as {
				repository?: { url?: string } | string;
			};

			const repo = typeof meta.repository === 'string' ? meta.repository : (meta.repository?.url ?? '');

			return {
				ok: true,
				verified: repoUrlsMatch(repo, projectRepoUrl),
				reason: repoUrlsMatch(repo, projectRepoUrl)
					? undefined
					: 'npm package repository does not match the project repo'
			};
		} catch {
			return { ok: false, verified: false, reason: 'package not found on npm' };
		}
	},
	async fetch(pkg) {
		const body = (await getJson(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(pkg)}`)) as {
			downloads: number;
		};

		return { value: body.downloads, raw: { weeklyDownloads: body.downloads } };
	}
};

const pypi: TractionFetcher = {
	kind: 'pypi',
	async validate(pkg, projectRepoUrl) {
		try {
			const meta = (await getJson(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`)) as {
				info?: { project_urls?: Record<string, string> | null; home_page?: string | null };
			};

			const urls = [...Object.values(meta.info?.project_urls ?? {}), meta.info?.home_page ?? ''];
			const verified = urls.some((u) => repoUrlsMatch(u, projectRepoUrl));
			return {
				ok: true,
				verified,
				reason: verified ? undefined : 'pypi project urls do not include the project repo'
			};
		} catch {
			return { ok: false, verified: false, reason: 'package not found on pypi' };
		}
	},
	async fetch(pkg) {
		const body = (await getJson(
			`https://pypistats.org/api/packages/${encodeURIComponent(pkg.toLowerCase())}/recent`
		)) as { data: { last_week: number } };

		return { value: body.data.last_week, raw: { weeklyDownloads: body.data.last_week } };
	}
};

const crates: TractionFetcher = {
	kind: 'crates',
	async validate(name, projectRepoUrl) {
		try {
			const body = (await getJson(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`)) as {
				crate: { repository?: string | null };
			};

			const verified = repoUrlsMatch(body.crate.repository, projectRepoUrl);
			return {
				ok: true,
				verified,
				reason: verified ? undefined : 'crate repository does not match the project repo'
			};
		} catch {
			return { ok: false, verified: false, reason: 'crate not found' };
		}
	},
	async fetch(name) {
		const body = (await getJson(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`)) as {
			crate: { recent_downloads: number };
		};

		return {
			value: body.crate.recent_downloads,
			raw: { recentDownloads: body.crate.recent_downloads }
		};
	}
};

const firefoxAddon: TractionFetcher = {
	kind: 'firefox_addon',
	async validate(slug, projectRepoUrl) {
		try {
			const body = (await getJson(`https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(slug)}/`)) as {
				homepage?: { url?: Record<string, string> } | null;
			};

			const home = Object.values(body.homepage?.url ?? {})[0];
			return { ok: true, verified: repoUrlsMatch(home, projectRepoUrl) };
		} catch {
			return { ok: false, verified: false, reason: 'addon not found on AMO' };
		}
	},
	async fetch(slug) {
		const body = (await getJson(`https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(slug)}/`)) as {
			average_daily_users: number;
		};

		return { value: body.average_daily_users, raw: { adu: body.average_daily_users } };
	}
};

const chromeExt: TractionFetcher = {
	kind: 'chrome_ext',
	// Chrome Web Store has no official API - never auto-verified, best-effort count
	async validate(id) {
		const ok = /^[a-p]{32}$/.test(id);
		return {
			ok,
			verified: false,
			reason: ok ? 'CWS sources need staff verification' : 'invalid extension id'
		};
	},
	async fetch(id) {
		const res = await fetch(`https://chromewebstore.google.com/detail/${id}`, {
			headers: { 'User-Agent': 'Mozilla/5.0 (compatible; anvil.hackclub.com)' }
		});

		if (!res.ok) throw new Error(`CWS ${id} -> ${res.status}`);

		const html = await res.text();
		const m = html.match(/([\d,.]+)\s*users/i);
		const value = m ? parseInt(m[1].replace(/[,.]/g, ''), 10) : 0;
		return { value, raw: { scraped: true } };
	}
};

export const FETCHERS: Record<string, TractionFetcher> = {
	github_repo: github,
	npm,
	pypi,
	crates,
	firefox_addon: firefoxAddon,
	chrome_ext: chromeExt
};
