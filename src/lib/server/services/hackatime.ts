// Hackatime client. No user OAuth: a server-side admin key
// (HACKATIME_ADMIN_KEY, an hka_ admin API key) authorizes identity lookups +
// per-user stats reads, so accounts link automatically from the slack id /
// email HCA gives us - one less auth screen for the user.
//
// The admin API (/api/admin/v1) is the ground source of truth: it has no rate
// limits and, unlike the public v1 endpoints, works for users who enabled
// "disable public stats" (the public endpoints 403 for them, and the public
// lookup_slack_uid/lookup_email fallbacks only accept hackatime's shared
// STATS_API_KEY - which our hka_ key is not). Every reader below goes
// admin-first and falls back to the public endpoint.
//
// Principles:
// - live seconds are NEVER persisted as truth - always fetched, SWR-cached
// - ship-time reads BYPASS the cache (they become the immutable snapshot)
// - HACKATIME_MOCK=1 swaps in a deterministic fake so window math is testable
import { flag, optional } from '../env';
import { SEASON_START } from '$lib/config/season';

const BASE = 'https://hackatime.hackclub.com/api/v1';
const ADMIN_BASE = 'https://hackatime.hackclub.com/api/admin/v1';

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

class HttpError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
	const key = optional('HACKATIME_ADMIN_KEY');
	const res = await fetch(url, {
		...init,
		headers: {
			...(key ? { Authorization: `Bearer ${key}` } : {}),
			...(init.body ? { 'Content-Type': 'application/json' } : {})
		}
	});

	if (!res.ok) throw new HttpError(res.status, `hackatime ${init.method ?? 'GET'} ${url} -> ${res.status}`);

	return (await res.json()) as T;
}

const get = <T>(path: string) => request<T>(`${BASE}${path}`);
const adminGet = <T>(path: string) => request<T>(`${ADMIN_BASE}${path}`);
const adminPost = <T>(path: string, body: unknown) =>
	request<T>(`${ADMIN_BASE}${path}`, { method: 'POST', body: JSON.stringify(body) });

const mocked = () => flag('HACKATIME_MOCK');

// ── admin API plumbing ────────────────────────────────────────────────────

// probe /check once; a 401/403 verdict is final (bad key), anything else
// (network hiccup) is retried on the next call
let adminOk: boolean | null = null;
let adminProbe: Promise<boolean> | null = null;

async function adminAvailable(): Promise<boolean> {
	if (!optional('HACKATIME_ADMIN_KEY')) return false;

	if (adminOk !== null) return adminOk;

	adminProbe ??= adminGet<{ valid?: boolean }>('/check')
		.then((body) => (adminOk = body.valid === true))
		.catch((err) => {
			if (err instanceof HttpError && (err.status === 401 || err.status === 403)) adminOk = false;

			adminProbe = null;
			return false;
		});

	return adminProbe;
}

const isNumericId = (s: string) => /^\d+$/.test(s);
const isSlackUid = (s: string) => /^[UW][A-Z0-9]{5,}$/.test(s);
const epochSec = (d: Date) => Math.floor(d.getTime() / 1000);

// hackatime suffixes provisional usernames, e.g. "foo... (email sign-up)" -
// strip the parenthesized tail and trailing dots, they're not part of the
// actual name
function cleanUsername(raw: string | null | undefined): string | null {
	return (
		raw
			?.replace(/\s*\(.*\)\s*$/, '')
			.replace(/\.+$/, '')
			.trim() || null
	);
}

interface AdminProfile {
	id: string;
	username: string | null;
	slackUid: string | null;
}

async function adminProfileById(userId: string): Promise<AdminProfile | null> {
	try {
		const body = await adminGet<{
			user?: {
				id: number | string;
				username?: string | null;
				slack_username?: string | null;
				slack_uid?: string | null;
			};
		}>(`/user/info?user_id=${encodeURIComponent(userId)}`);

		const u = body.user;
		if (u?.id == null) return null;

		return {
			id: String(u.id),
			username: cleanUsername(u.username ?? u.slack_username),
			slackUid: u.slack_uid ?? null
		};
	} catch (err) {
		if (err instanceof HttpError && err.status === 404) return null;

		throw err;
	}
}

// no direct slack-uid lookup on the admin API - fuzzy-search ranks an exact
// slack uid match first, then user/info confirms it (the search response
// doesn't echo the slack uid back)
async function adminProfileBySlackUid(slackId: string): Promise<AdminProfile | null> {
	const body = await adminPost<{ users?: { id: number | string }[] }>('/user/search_fuzzy', { query: slackId });

	for (const candidate of (body.users ?? []).slice(0, 3)) {
		const profile = await adminProfileById(String(candidate.id));
		if (profile?.slackUid === slackId) return profile;
	}

	return null;
}

async function adminIdByEmail(email: string): Promise<string | null> {
	try {
		const body = await adminPost<{ user_id?: number | string }>('/user/get_user_by_email', { email });
		return body.user_id != null ? String(body.user_id) : null;
	} catch (err) {
		if (err instanceof HttpError && err.status === 404) return null;

		throw err;
	}
}

// ── identity lookups ──────────────────────────────────────────────────────

/**
 * Resolve an identifier (numeric Hackatime id, Slack UID, or HCA id) to a
 * profile. Admin-first: the admin API resolves numeric ids and slack uids
 * even for private-stats users. HCA ids only resolve via the public stats
 * endpoint (which also carries the username - for Hack Club users, their
 * slack username).
 */
export async function getStatsProfile(identifier: string): Promise<{ id: string; username: string | null } | null> {
	if (mocked()) return { id: '1001', username: 'orpheus' };

	if (await adminAvailable()) {
		try {
			const profile = isNumericId(identifier)
				? await adminProfileById(identifier)
				: isSlackUid(identifier)
					? await adminProfileBySlackUid(identifier)
					: null; // HCA ids: only the public endpoint resolves those

			if (profile) return { id: profile.id, username: profile.username };
		} catch {
			// fall through to the public endpoint
		}
	}

	try {
		const body = await get<{ data?: { user_id?: number | string; username?: string } }>(
			`/users/${encodeURIComponent(identifier)}/stats`
		);

		const id = body.data?.user_id;
		if (id == null) return null;

		return { id: String(id), username: cleanUsername(body.data?.username) };
	} catch {
		return null;
	}
}

export async function lookupBySlackUid(slackId: string): Promise<string | null> {
	if (mocked()) return '1001';

	if (await adminAvailable()) {
		try {
			const profile = await adminProfileBySlackUid(slackId);
			if (profile) return profile.id;
		} catch {
			// fall through to the public endpoint
		}
	}

	try {
		const body = await get<{ user_id: number | string }>(`/users/lookup_slack_uid/${encodeURIComponent(slackId)}`);

		return String(body.user_id);
	} catch {
		return null;
	}
}

export async function lookupByEmail(email: string): Promise<string | null> {
	if (mocked()) return '1001';

	if (await adminAvailable()) {
		try {
			const id = await adminIdByEmail(email);
			if (id) return id;
		} catch {
			// fall through to the public endpoint
		}
	}

	try {
		const body = await get<{ user_id: number | string }>(`/users/lookup_email/${encodeURIComponent(email)}`);

		return String(body.user_id);
	} catch {
		return null;
	}
}

// ── stats ─────────────────────────────────────────────────────────────────

/**
 * Per-project totals within [since, until] - admin-first (works for
 * private-stats users; admin durations use the same capped-gap algorithm as
 * the public endpoint, so numbers agree), falling back to the public
 * projects/details endpoint.
 *
 * Date params: the admin API only keeps sub-day precision for integer epoch
 * seconds (ISO strings get truncated to day boundaries); the public endpoint
 * filters on start_date/end_date (NOT since/until - those are silently
 * ignored, which would return all-time totals and break the hour-window
 * snapshot) and honors full ISO8601.
 */
async function fetchProjectTotals(ident: HackatimeIdentity, since: Date, until?: Date): Promise<HackatimeProject[]> {
	if (isNumericId(ident.id) && (await adminAvailable())) {
		try {
			const qs = new URLSearchParams({ user_id: ident.id, start_date: String(epochSec(since)) });
			if (until) qs.set('end_date', String(epochSec(until)));

			const body = await adminGet<{
				projects: { name: string; total_duration: number; last_heartbeat: number | null }[];
			}>(`/user/projects?${qs}`);

			return body.projects.map((p) => ({
				name: p.name,
				total_seconds: p.total_duration,
				most_recent_heartbeat: p.last_heartbeat
			}));
		} catch {
			// fall through to the public endpoint
		}
	}

	const qs = new URLSearchParams({ start_date: since.toISOString() });
	if (until) qs.set('end_date', until.toISOString());

	const body = await get<{ projects: HackatimeProject[] } | HackatimeProject[]>(
		`/users/${encodeURIComponent(ident.id)}/projects/details?${qs}`
	);

	return Array.isArray(body) ? body : body.projects;
}

/** All of a user's Hackatime projects since season start (for the key picker). */
export async function listUserProjects(ident: HackatimeIdentity): Promise<HackatimeProject[]> {
	if (mocked()) {
		return MOCK_KEYS.map((name) => ({
			name,
			total_seconds: mockSeconds(name, SEASON_START, new Date())
		}));
	}

	return swr(`projects:${ident.id}`, async () => {
		const projects = await fetchProjectTotals(ident, SEASON_START);

		const recency = (p: HackatimeProject) => {
			if (p.most_recent_heartbeat == null) return 0;

			const t =
				typeof p.most_recent_heartbeat === 'number'
					? p.most_recent_heartbeat * 1000
					: Date.parse(p.most_recent_heartbeat);

			return Number.isFinite(t) ? t : 0;
		};

		return projects
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
		const list = await fetchProjectTotals(ident, since, until);
		return keys.map((key) => ({
			key,
			seconds: list.find((p) => p.name === key)?.total_seconds ?? 0
		}));
	};

	if (opts.fresh) return fetcher();

	const cacheKey = `seconds:${ident.id}:${keys.join(',')}:${since.getTime()}:${Math.floor(until.getTime() / FRESH_MS)}`;
	return swr(cacheKey, fetcher);
}

// hackatime's heartbeat session timeout - a gap above this breaks the span,
// a gap below it extends the span by the gap (mirrors Heartbeatable#to_span)
const SPAN_TIMEOUT_S = 120;

/** Rebuild coding spans from raw heartbeat timestamps (epoch seconds). */
function spansFromTimes(times: number[]): { start_time: number; end_time: number }[] {
	const sorted = [...times].sort((a, b) => a - b);
	const spans: { start_time: number; end_time: number }[] = [];
	let spanStart = sorted[0];

	for (let i = 0; i < sorted.length; i++) {
		const cur = sorted[i];
		const next = sorted[i + 1];
		if (next !== undefined && next - cur <= SPAN_TIMEOUT_S) continue;

		const end = next !== undefined ? cur + Math.min(next - cur, SPAN_TIMEOUT_S) : cur;
		if (end - spanStart > 0) spans.push({ start_time: spanStart, end_time: end });

		if (next !== undefined) spanStart = next;
	}

	return spans;
}

/**
 * Coding spans for one key within [since, until]. Admin-first: pages through
 * raw heartbeats (works for private-stats users) and rebuilds spans locally;
 * falls back to the public heartbeats/spans endpoint.
 */
async function fetchSpans(
	ident: HackatimeIdentity,
	key: string,
	since: Date,
	until: Date
): Promise<{ start_time: number; end_time: number }[]> {
	if (isNumericId(ident.id) && (await adminAvailable())) {
		try {
			const times: number[] = [];
			for (let offset = 0; ;) {
				const qs = new URLSearchParams({
					user_id: ident.id,
					project: key,
					start_date: String(epochSec(since)),
					end_date: String(epochSec(until)),
					limit: '5000',
					offset: String(offset)
				});

				const body = await adminGet<{ heartbeats: { time: number }[]; has_more: boolean }>(`/user/heartbeats?${qs}`);

				times.push(...body.heartbeats.map((h) => h.time));
				if (!body.has_more || body.heartbeats.length === 0) break;

				offset += body.heartbeats.length;
			}

			return spansFromTimes(times);
		} catch {
			// fall through to the public endpoint
		}
	}

	const day = (d: Date) => d.toISOString().slice(0, 10);
	const body = await get<{ spans: { start_time: number; end_time: number }[] }>(
		`/users/${encodeURIComponent(ident.id)}/heartbeats/spans?start_date=${day(since)}&end_date=${day(until)}&project=${encodeURIComponent(key)}&filter_by_project=true`
	);

	return body.spans ?? [];
}

/**
 * Hourly activity bins for a set of keys, aligned to UTC midnight `days` days
 * ago through now - feeds the project page's 7-day heatgraph. Fetches coding
 * spans per key and distributes span durations across hour buckets.
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

	// end_date is exclusive on some hackatime deployments - pad a day, the
	// bin clipping below discards any overshoot
	const endPadded = new Date(now.getTime() + 86_400_000);
	const fetcher = async () => {
		const out = new Array<number>(nBins).fill(0);
		for (const key of keys) {
			try {
				const spans = await fetchSpans(ident, key, start, endPadded);

				for (const span of spans) {
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
