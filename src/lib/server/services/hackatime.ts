// Hackatime client. No user OAuth: a server-side stats/admin key
// (HACKATIME_ADMIN_KEY) authorizes identity lookups + per-user stats reads,
// so accounts link automatically from the slack id / email HCA gives us -
// one less auth screen for the user.
//
// Principles:
// - live seconds are NEVER persisted as truth - always fetched, SWR-cached
// - ship-time reads BYPASS the cache (they become the immutable snapshot)
// - HACKATIME_MOCK=1 swaps in a deterministic fake so window math is testable
import { flag, optional } from '../env';
import { SEASON_START } from '$lib/config/season';

const BASE = 'https://hackatime.hackclub.com/api/v1';

export interface HackatimeProject {
	name: string;
	total_seconds: number;
	most_recent_heartbeat?: string | number | null;
}

export interface HackatimeIdentity {
	/** numeric Hackatime user id (as string) or slack id - whatever we have */
	id: string;
}

// ── deterministic mock (dev + tests) ─────────────────────────────────────
// seconds tracked on `key` in [since, until] = wallHours × ratePerHour(key),
// a pure function of the window, so hour-window tests are exact.
function mockRate(key: string): number {
	let h = 0;
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
	return 200 + (Math.abs(h) % 800); // 200..999 tracked seconds per wall-hour
}

function mockSeconds(key: string, since: Date, until: Date): number {
	const hours = Math.max(0, (until.getTime() - since.getTime()) / 3_600_000);
	return Math.floor(hours * mockRate(key));
}

const MOCK_KEYS = ['termcast', 'termcast-site', 'my-cool-cli', 'dotfiles'];

// ── SWR cache ─────────────────────────────────────────────────────────────
interface CacheEntry {
	data: unknown;
	fetchedAt: number;
	revalidating: boolean;
}

const cache = new Map<string, CacheEntry>();
const FRESH_MS = 60_000;
const STALE_MAX_MS = 3_600_000;

async function swr<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
	const hit = cache.get(key);
	const now = Date.now();
	if (hit && now - hit.fetchedAt < FRESH_MS) return hit.data as T;

	if (hit && now - hit.fetchedAt < STALE_MAX_MS) {
		if (!hit.revalidating) {
			hit.revalidating = true;
			fetcher()
				.then((data) => cache.set(key, { data, fetchedAt: Date.now(), revalidating: false }))
				.catch(() => (hit.revalidating = false));
		}

		return hit.data as T;
	}

	const data = await fetcher();
	cache.set(key, { data, fetchedAt: Date.now(), revalidating: false });
	return data;
}

async function get<T>(path: string): Promise<T> {
	const key = optional('HACKATIME_ADMIN_KEY');
	const res = await fetch(`${BASE}${path}`, {
		headers: key ? { Authorization: `Bearer ${key}` } : {}
	});

	if (!res.ok) throw new Error(`hackatime GET ${path} -> ${res.status}`);

	return (await res.json()) as T;
}

const mocked = () => flag('HACKATIME_MOCK');

// ── identity lookups ──────────────────────────────────────────────────────

/**
 * The public per-user stats endpoint accepts a Slack UID (or HCA id) directly
 * as the identifier; its response carries the numeric Hackatime user_id AND
 * the username (which for Hack Club users is their slack username) - no stats
 * key required. Primary resolution path.
 */
export async function getStatsProfile(identifier: string): Promise<{ id: string; username: string | null } | null> {
	if (mocked()) return { id: '1001', username: 'orpheus' };

	try {
		const body = await get<{ data?: { user_id?: number | string; username?: string } }>(
			`/users/${encodeURIComponent(identifier)}/stats`
		);

		const id = body.data?.user_id;
		if (id == null) return null;

		// hackatime suffixes provisional usernames, e.g. "foo... (email sign-up)"
		// - strip the parenthesized tail and trailing dots, they're not part of
		// the actual name
		const username =
			body.data?.username
				?.replace(/\s*\(.*\)\s*$/, '')
				.replace(/\.+$/, '')
				.trim() || null;

		return { id: String(id), username };
	} catch {
		return null;
	}
}

export async function lookupBySlackUid(slackId: string): Promise<string | null> {
	if (mocked()) return '1001';

	try {
		const body = await get<{ user_id: number | string }>(`/users/lookup_slack_uid/${encodeURIComponent(slackId)}`);

		return String(body.user_id);
	} catch {
		return null;
	}
}

export async function lookupByEmail(email: string): Promise<string | null> {
	if (mocked()) return '1001';

	try {
		const body = await get<{ user_id: number | string }>(`/users/lookup_email/${encodeURIComponent(email)}`);

		return String(body.user_id);
	} catch {
		return null;
	}
}

// ── stats ─────────────────────────────────────────────────────────────────

/** All of a user's Hackatime projects since season start (for the key picker). */
export async function listUserProjects(ident: HackatimeIdentity): Promise<HackatimeProject[]> {
	if (mocked()) {
		return MOCK_KEYS.map((name) => ({
			name,
			total_seconds: mockSeconds(name, SEASON_START, new Date())
		}));
	}

	const since = SEASON_START.toISOString().slice(0, 10);
	return swr(`projects:${ident.id}`, async () => {
		const body = await get<{ projects: HackatimeProject[] }>(
			`/users/${encodeURIComponent(ident.id)}/projects/details?start_date=${since}`
		);

		const recency = (p: HackatimeProject) => {
			if (p.most_recent_heartbeat == null) return 0;

			const t =
				typeof p.most_recent_heartbeat === 'number'
					? p.most_recent_heartbeat * 1000
					: Date.parse(p.most_recent_heartbeat);

			return Number.isFinite(t) ? t : 0;
		};

		return body.projects
			.filter((p) => p.name !== 'Other' && p.name !== '<<LAST_PROJECT>>')
			.sort((a, b) => recency(b) - recency(a)); // most recently active first
	});
}

/**
 * Per-key seconds within [since, until] - THE call the hour-window algorithm
 * runs on. `fresh: true` bypasses the SWR cache (ship-time snapshots).
 */
export async function getKeySeconds(
	ident: HackatimeIdentity,
	keys: string[],
	since: Date,
	until: Date,
	opts: { fresh?: boolean } = {}
): Promise<{ key: string; seconds: number }[]> {
	if (keys.length === 0) return [];

	if (mocked()) {
		return keys.map((key) => ({ key, seconds: mockSeconds(key, since, until) }));
	}

	const fetcher = async () => {
		// the /projects/details endpoint filters on start_date/end_date (NOT
		// since/until - those are silently ignored, which would return all-time
		// totals and break the hour-window snapshot). Full ISO8601 is honored,
		// so the window keeps sub-day precision.
		const qs = new URLSearchParams({
			projects: keys.join(','),
			start_date: since.toISOString(),
			end_date: until.toISOString()
		});

		const body = await get<{ projects: HackatimeProject[] } | HackatimeProject[]>(
			`/users/${encodeURIComponent(ident.id)}/projects/details?${qs}`
		);

		const list = Array.isArray(body) ? body : body.projects;
		return keys.map((key) => ({
			key,
			seconds: list.find((p) => p.name === key)?.total_seconds ?? 0
		}));
	};

	if (opts.fresh) return fetcher();

	const cacheKey = `seconds:${ident.id}:${keys.join(',')}:${since.getTime()}:${Math.floor(until.getTime() / FRESH_MS)}`;
	return swr(cacheKey, fetcher);
}

/**
 * Hourly activity bins for a set of keys, aligned to UTC midnight `days` days
 * ago through now - feeds the project page's 7-day heatgraph. Uses the
 * heartbeats/spans endpoint (per key) and distributes span durations across
 * hour buckets.
 */
export async function getHourlyBins(
	ident: HackatimeIdentity,
	keys: string[],
	days = 7
): Promise<{ start: Date; bins: number[] }> {
	const now = new Date();
	const start = new Date(now);
	start.setUTCHours(0, 0, 0, 0);
	start.setUTCDate(start.getUTCDate() - (days - 1));
	const nBins = Math.ceil((now.getTime() - start.getTime()) / 3_600_000);
	const bins = new Array<number>(nBins).fill(0);
	if (keys.length === 0) return { start, bins };

	if (mocked()) {
		for (const key of keys) {
			for (let i = 0; i < nBins; i++) {
				const r = ((key.length * 131 + i * 37) % 97) / 97;
				if (r > 0.62) {
					bins[i] += Math.floor(r * 3000);
				}
			}
		}

		return { start, bins };
	}

	const day = (d: Date) => d.toISOString().slice(0, 10);
	// end_date is exclusive on some hackatime deployments - pad a day, the
	// bin clipping below discards any overshoot
	const endPadded = new Date(now.getTime() + 86_400_000);
	const fetcher = async () => {
		const out = new Array<number>(nBins).fill(0);
		for (const key of keys) {
			try {
				const body = await get<{
					spans: { start_time: number; end_time: number; duration: number }[];
				}>(
					`/users/${encodeURIComponent(ident.id)}/heartbeats/spans?start_date=${day(start)}&end_date=${day(endPadded)}&project=${encodeURIComponent(key)}&filter_by_project=true`
				);

				for (const span of body.spans ?? []) {
					// distribute the span across the hour buckets it touches
					let from = Math.max(span.start_time * 1000, start.getTime());
					const to = Math.min(span.end_time * 1000, now.getTime());
					while (from < to) {
						const idx = Math.floor((from - start.getTime()) / 3_600_000);
						const hourEnd = start.getTime() + (idx + 1) * 3_600_000;
						const chunk = Math.min(to, hourEnd) - from;
						if (idx >= 0 && idx < nBins) {
							out[idx] += Math.round(chunk / 1000);
						}

						from += chunk;
					}
				}
			} catch {
				// a missing key just contributes nothing
			}
		}

		return out;
	};

	const cacheKey = `bins:${ident.id}:${keys.join(',')}:${Math.floor(now.getTime() / (10 * FRESH_MS))}`;
	return { start, bins: await swr(cacheKey, fetcher) };
}

/** Trust factor - "red" means convicted/banned on Hackatime's side. */
export async function getTrustLevel(ident: HackatimeIdentity): Promise<'blue' | 'green' | 'red'> {
	if (mocked()) return 'blue';

	try {
		const body = await get<{ trust_level: 'blue' | 'green' | 'red' }>(
			`/users/${encodeURIComponent(ident.id)}/trust_factor`
		);

		return body.trust_level;
	} catch {
		return 'blue'; // unknown ≠ blocked
	}
}
