// Hack Club Auth (HCA) - OIDC against auth.hackclub.com.
// Docs: github.com/hackclub/auth app/views/docs. Registered as an HQ-official
// app so we can request address/birthdate/legal_name (needed for fulfillment
// + the Unified YSWS DB). Tokens last ~6 months; refresh tokens rotate.
import { OAuth2Client, generateState } from 'arctic';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { audit } from '../audit';
import { feedSignup } from '../services/slackFeed';
import { inviteToSignupChannels } from '../services/slackNotify';
import { encryptColumn, decryptColumn } from '../crypto';
import { flag, optional, required } from '../env';
import type { User } from '../db/schema';

// NOTE: the docs mention a legal_name scope but the app registration UI does
// not offer it - legal names arrive via `profile` if HCA sends them at all;
// our columns are optional with regular-name fallbacks either way.
export const HCA_SCOPES = [
	'openid',
	'profile',
	'email',
	'slack_id',
	'verification_status',
	// HQ-official scopes:
	'address',
	'birthdate',
	'phone' // fulfillment - couriers want a phone number
];

function issuer(): string {
	return optional('HCA_ISSUER', 'https://auth.hackclub.com');
}

function client(): OAuth2Client {
	return new OAuth2Client(
		required('HCA_CLIENT_ID'),
		required('HCA_CLIENT_SECRET'),
		`${required('PUBLIC_BASE_URL')}/auth/callback`
	);
}

export { generateState };

export function authorizationUrl(state: string): URL {
	return client().createAuthorizationURL(`${issuer()}/oauth/authorize`, state, HCA_SCOPES);
}

export async function exchangeCode(code: string) {
	const tokens = await client().validateAuthorizationCode(`${issuer()}/oauth/token`, code, null);
	return {
		accessToken: tokens.accessToken(),
		refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : null,
		expiresAt: tokens.accessTokenExpiresAt()
	};
}

/** Shape of GET /api/v1/me (fields present depend on granted scopes). */
export interface HcaMe {
	id: string; // "ident!..."
	email: string;
	email_verified?: boolean;
	name?: string;
	given_name?: string;
	family_name?: string;
	legal_first_name?: string;
	legal_last_name?: string;
	nickname?: string;
	birthdate?: string; // ISO date
	phone_number?: string;
	phone_number_verified?: boolean;
	slack_id?: string;
	verification_status?: 'needs_submission' | 'pending' | 'verified' | 'ineligible';
	ysws_eligible?: boolean;
	address?: {
		street_address?: string;
		locality?: string;
		region?: string;
		postal_code?: string;
		country?: string;
	};
}

/** Accepts the documented shape, common envelopes, and OIDC claim names. */
function normalizeMe(raw: Record<string, unknown>): HcaMe | null {
	const body = (raw.user ?? raw.identity ?? raw.data ?? raw) as Record<string, unknown>;
	const id = (body.id ?? body.sub) as string | undefined;
	const email = body.email as string | undefined;
	if (!id || !email) return null;

	// verification_status arrives in various casings/vocabularies across HCA
	// surfaces (e.g. VERIFIED_ELIGIBLE from the omniauth path)
	const rawStatus = String(body.verification_status ?? '').toLowerCase();
	const status: HcaMe['verification_status'] = (
		{
			needs_submission: 'needs_submission',
			unverified: 'needs_submission',
			pending: 'pending',
			verified: 'verified',
			verified_eligible: 'verified',
			verified_but_over_18: 'verified',
			ineligible: 'ineligible',
			rejected: 'ineligible'
		} as const
	)[rawStatus];

	const eligible = typeof body.ysws_eligible === 'boolean' ? body.ysws_eligible : rawStatus === 'verified_eligible';

	return {
		...(body as unknown as HcaMe),
		id,
		email,
		verification_status: status ?? 'needs_submission',
		ysws_eligible: eligible
	};
}

export async function fetchMe(accessToken: string): Promise<HcaMe> {
	const headers = { Authorization: `Bearer ${accessToken}` };

	const res = await fetch(`${issuer()}/api/v1/me`, { headers });
	const raw = res.ok ? ((await res.json()) as Record<string, unknown>) : {};
	let me = normalizeMe(raw);

	if (!me) {
		// fall back to the standards-guaranteed OIDC userinfo endpoint
		const ui = await fetch(`${issuer()}/oauth/userinfo`, { headers });
		if (ui.ok) {
			const uiRaw = (await ui.json()) as Record<string, unknown>;
			me = normalizeMe(uiRaw);
			if (!me) {
				throw new Error(
					`HCA profile missing id/email. /api/v1/me -> ${JSON.stringify(raw).slice(0, 500)} ; userinfo -> ${JSON.stringify(uiRaw).slice(0, 500)}`
				);
			}
		} else {
			throw new Error(
				`HCA profile missing id/email and userinfo failed (${ui.status}). /api/v1/me -> ${JSON.stringify(raw).slice(0, 500)}`
			);
		}
	}

	return me;
}

/** Map an HcaMe payload onto our users columns (shared by login + refresh).
 *  Deliberately NO PII at rest: names, birthday, phone, and address live in
 *  HCA only and are fetched on demand (fetchLiveProfile) at the moments that
 *  need them - order address reveal + the Unified YSWS DB sync. */
export function userColumnsFrom(
	me: HcaMe,
	tokens?: { accessToken: string; refreshToken: string | null; expiresAt: Date }
) {
	return {
		hcaId: me.id,
		email: me.email,
		slackId: me.slack_id ?? null,
		verificationStatus: me.verification_status ?? ('needs_submission' as const),
		yswsEligible: me.ysws_eligible ?? false,
		verificationRefreshedAt: new Date(),
		...(tokens
			? {
					hcaAccessToken: encryptColumn(tokens.accessToken),
					hcaRefreshToken: tokens.refreshToken ? encryptColumn(tokens.refreshToken) : null,
					hcaTokenExpiresAt: tokens.expiresAt
				}
			: {})
	};
}

/** The PII HCA holds for us - fetched live, never persisted. */
export interface HcaProfile {
	firstName: string | null;
	lastName: string | null;
	legalFirstName: string | null;
	legalLastName: string | null;
	birthday: string | null;
	phoneNumber: string | null;
	addressLine1: string | null;
	addressLine2: string | null;
	addressCity: string | null;
	addressState: string | null;
	addressPostalCode: string | null;
	addressCountry: string | null;
}

export function profileFrom(me: HcaMe): HcaProfile {
	// street_address may contain "line1\nline2" per OIDC convention
	const [line1, ...rest] = (me.address?.street_address ?? '').split('\n');
	return {
		firstName: me.given_name ?? null,
		lastName: me.family_name ?? null,
		legalFirstName: me.legal_first_name ?? null,
		legalLastName: me.legal_last_name ?? null,
		birthday: me.birthdate ?? null,
		phoneNumber: me.phone_number ?? null,
		addressLine1: line1 || null,
		addressLine2: rest.join('\n') || null,
		addressCity: me.address?.locality ?? null,
		addressState: me.address?.region ?? null,
		addressPostalCode: me.address?.postal_code ?? null,
		addressCountry: me.address?.country ?? null
	};
}

export async function upsertUserFromLogin(
	me: HcaMe,
	tokens: { accessToken: string; refreshToken: string | null; expiresAt: Date }
): Promise<User> {
	const cols = userColumnsFrom(me, tokens);
	// spot fresh signups BEFORE the upsert - they go to the slack feed
	const [existing] = await db()
		.select({ id: schema.users.id })
		.from(schema.users)
		.where(eq(schema.users.hcaId, cols.hcaId));

	const [user] = await db()
		.insert(schema.users)
		.values(cols)
		.onConflictDoUpdate({ target: schema.users.hcaId, set: cols })
		.returning();

	if (!existing) {
		feedSignup(user);
		inviteToSignupChannels(user);
		audit({
			actorType: 'user',
			actorId: user.id,
			action: 'user.signup',
			entityType: 'user',
			entityId: user.id
		});
	}

	return user;
}

/** Public, tokenless verification check - used by the daily refresh job. */
export async function checkVerification(
	hcaId: string
): Promise<{ status: User['verificationStatus']; eligible: boolean } | null> {
	const res = await fetch(`${issuer()}/api/external/check?idv_id=${encodeURIComponent(hcaId)}`);
	if (!res.ok) return null;

	const body = (await res.json()) as { result: string };
	switch (body.result) {
		case 'verified_eligible':
			return { status: 'verified', eligible: true };
		case 'verified_but_over_18':
			return { status: 'verified', eligible: false };
		case 'pending':
			return { status: 'pending', eligible: false };
		case 'rejected':
			return { status: 'ineligible', eligible: false };
		case 'needs_submission':
			return { status: 'needs_submission', eligible: false };
		default:
			return null;
	}
}

export class HcaTokenError extends Error {}

/** A valid access token for the user, rotating + persisting near expiry. */
async function freshAccessToken(user: User): Promise<string> {
	if (!user.hcaAccessToken) {
		throw new HcaTokenError('no HCA token on file - the user needs to log in again');
	}

	let accessToken = decryptColumn(user.hcaAccessToken);

	const nearExpiry = user.hcaTokenExpiresAt && user.hcaTokenExpiresAt.getTime() - Date.now() < 7 * 86400_000;

	if (nearExpiry && user.hcaRefreshToken) {
		const tokens = await client().refreshAccessToken(
			`${issuer()}/oauth/token`,
			decryptColumn(user.hcaRefreshToken),
			HCA_SCOPES
		);

		accessToken = tokens.accessToken();
		await db()
			.update(schema.users)
			.set({
				hcaAccessToken: encryptColumn(accessToken),
				hcaRefreshToken: tokens.hasRefreshToken() ? encryptColumn(tokens.refreshToken()) : user.hcaRefreshToken,
				hcaTokenExpiresAt: tokens.accessTokenExpiresAt()
			})
			.where(eq(schema.users.id, user.id));
	}

	return accessToken;
}

/** Re-fetch /api/v1/me with the stored token (refreshing it if near expiry). */
export async function refreshUserFromHca(user: User): Promise<void> {
	if (!user.hcaAccessToken) return;

	const me = await fetchMe(await freshAccessToken(user));
	// prettier-ignore
	await db()
		.update(schema.users)
		.set(userColumnsFrom(me))
		.where(eq(schema.users.id, user.id));
}

/** The user's PII, live from HCA - used at reveal/sync time, never stored.
 *  HCA_MOCK=1 returns a fixture so seeded dev users (no real tokens) can
 *  exercise purchases / reveals / airtable dry-runs locally. */
export async function fetchLiveProfile(user: User): Promise<HcaProfile> {
	if (flag('HCA_MOCK')) {
		return {
			firstName: 'Orpheus',
			lastName: 'Dino',
			legalFirstName: null,
			legalLastName: null,
			birthday: '2009-04-01',
			phoneNumber: '+1 802 555 0100',
			addressLine1: '15 Falls Road',
			addressLine2: null,
			addressCity: 'Shelburne',
			addressState: 'VT',
			addressPostalCode: '05482',
			addressCountry: 'US'
		};
	}

	return profileFrom(await fetchMe(await freshAccessToken(user)));
}
