// The whole Anvil data model. Design notes:
// - ships are FIRST-CLASS rows: project fields are snapshotted on each ship,
//   so Sidekick timeline diffs are a compare of consecutive rows.
// - currency_ledger is append-only; balances are sums. Unique partial indexes
//   make payouts/top-ups idempotent.
// - OAuth tokens are AES-256-GCM encrypted via crypto.ts before storage.
import {
	boolean,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';

const id = () => uuid('id').primaryKey().defaultRandom();
// users/projects/ships/orders use small human-friendly ids (/projects/42,
// "order #7"); everything else keeps uuids.
const serialId = () => integer('id').primaryKey().generatedAlwaysAsIdentity();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => {
	return timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date());
};

export const verificationStatus = pgEnum('verification_status', [
	'needs_submission',
	'pending',
	'verified',
	'ineligible'
]);

export const trustLevel = pgEnum('trust_level', ['blue', 'green', 'red']);
export const shipStatus = pgEnum('ship_status', ['pending', 'pending_hq', 'approved', 'rejected', 'cancelled']);

export const projectShipStatus = pgEnum('project_ship_status', [
	'draft',
	'pending',
	'pending_hq',
	'approved',
	'rejected'
]);

export const reviewKind = pgEnum('review_kind', ['approval', 'rejection', 'comment', 'internal_comment']);

export const tractionKind = pgEnum('traction_kind', [
	'github_repo',
	'npm',
	'pypi',
	'crates',
	'chrome_ext',
	'firefox_addon'
]);

export const ledgerKind = pgEnum('ledger_kind', [
	'earn_ship',
	'earn_topup',
	'earn_quest',
	'spend_order',
	'refund_order',
	'adjustment'
]);

export const orderStatus = pgEnum('order_status', ['pending', 'fulfilled', 'cancelled']);
export const syncStatus = pgEnum('sync_status', ['pending', 'synced', 'failed']);

export const users = pgTable(
	'users',
	{
		id: serialId(),
		hcaId: text('hca_id').notNull().unique(), // "ident!..."
		slackId: text('slack_id').unique(),
		// slack username (via Hackatime) - the PRIMARY user-facing moniker.
		// NO PII at rest: names, birthday, phone, and address live in HCA and
		// are fetched live (hca.ts fetchLiveProfile) at reveal/sync time only.
		username: text('username'),
		email: text('email').notNull().unique(),
		verificationStatus: verificationStatus('verification_status').notNull().default('needs_submission'),
		yswsEligible: boolean('ysws_eligible').notNull().default(false),
		verificationRefreshedAt: timestamp('verification_refreshed_at', { withTimezone: true }),
		// encrypted columns (crypto.ts format)
		hcaAccessToken: text('hca_access_token'),
		hcaRefreshToken: text('hca_refresh_token'),
		hcaTokenExpiresAt: timestamp('hca_token_expires_at', { withTimezone: true }),
		hackatimeId: text('hackatime_id'),
		hackatimeAccessToken: text('hackatime_access_token'),
		hackatimeTrustLevel: trustLevel('hackatime_trust_level'),
		trustCheckedAt: timestamp('trust_checked_at', { withTimezone: true }),
		isAdmin: boolean('is_admin').notNull().default(false),
		isBanned: boolean('is_banned').notNull().default(false),
		banReason: text('ban_reason'),
		internalNotes: text('internal_notes'),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [index('users_slack_idx').on(t.slackId), index('users_hackatime_idx').on(t.hackatimeId)]
);

export const sessions = pgTable(
	'sessions',
	{
		id: id(),
		// sha256(cookie value) - a DB leak doesn't leak usable session tokens
		tokenHash: text('token_hash').notNull().unique(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		ip: text('ip'),
		userAgent: text('user_agent'),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)]
);

export const projects = pgTable(
	'projects',
	{
		id: serialId(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		title: text('title').notNull(),
		description: text('description').notNull().default(''),
		demoUrl: text('demo_url'),
		repoUrl: text('repo_url'),
		screenshotKey: text('screenshot_key'), // storage key; public URL derived
		// denormalized mirror of the latest ship, updated transactionally
		shipStatus: projectShipStatus('ship_status').notNull().default('draft'),
		locked: boolean('locked').notNull().default(false), // hard rejection
		level: integer('level').notNull().default(1), // high-water mark, LVL 1..10
		score: numeric('score', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
		scoreUpdatedAt: timestamp('score_updated_at', { withTimezone: true }),
		maxReviewedLevel: integer('max_reviewed_level').notNull().default(6),
		scoreFlagged: boolean('score_flagged').notNull().default(false),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [index('projects_user_idx').on(t.userId), index('projects_status_idx').on(t.shipStatus)]
);

export const hackatimeProjectLinks = pgTable(
	'hackatime_project_links',
	{
		id: id(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		projectId: integer('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		hackatimeKey: text('hackatime_key').notNull(),
		createdAt: createdAt()
	},
	(t) => [
		// a Hackatime key can only feed ONE Anvil project per user - no double-counting
		uniqueIndex('hackatime_links_user_key_uq').on(t.userId, t.hackatimeKey),
		index('hackatime_links_project_idx').on(t.projectId)
	]
);

export interface KeySeconds {
	key: string;
	seconds: number;
}

export const ships = pgTable(
	'ships',
	{
		id: serialId(),
		projectId: integer('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		shipNumber: integer('ship_number').notNull(),
		status: shipStatus('status').notNull().default('pending'),
		windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
		windowEnd: timestamp('window_end', { withTimezone: true }).notNull(), // hours-window upper bound (submittedAt is createdAt)
		secondsSubmitted: integer('seconds_submitted').notNull(),
		keySeconds: jsonb('key_seconds').$type<KeySeconds[]>().notNull(), // write-once audit
		// project field snapshot at ship time -> Sidekick ship diffs
		snapTitle: text('snap_title').notNull(),
		snapDescription: text('snap_description').notNull(),
		snapDemoUrl: text('snap_demo_url'),
		snapRepoUrl: text('snap_repo_url'),
		snapScreenshotUrl: text('snap_screenshot_url'),
		hoursAssigned: numeric('hours_assigned', { precision: 8, scale: 2, mode: 'number' }),
		decidedAt: timestamp('decided_at', { withTimezone: true }),
		hardRejected: boolean('hard_rejected').notNull().default(false),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		uniqueIndex('ships_project_number_uq').on(t.projectId, t.shipNumber),
		index('ships_status_idx').on(t.status),
		index('ships_project_window_idx').on(t.projectId, t.windowEnd)
	]
);

export const reviews = pgTable(
	'reviews',
	{
		id: id(),
		shipId: integer('ship_id')
			.notNull()
			.references(() => ships.id, { onDelete: 'cascade' }),
		projectId: integer('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		// Slack ID or "ident!..." - reviewers are Sidekick actors, not Anvil users
		reviewerActorId: text('reviewer_actor_id').notNull(),
		kind: reviewKind('kind').notNull(),
		// approvals start held (ship -> pending_hq) until a Sidekick "authorize"
		held: boolean('held').notNull().default(false),
		hoursAssigned: numeric('hours_assigned', { precision: 8, scale: 2, mode: 'number' }),
		feedback: text('feedback'),
		justification: text('justification'),
		internalMessage: text('internal_message'),
		fields: jsonb('fields').$type<Record<string, string | number | boolean>>(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => [index('reviews_project_idx').on(t.projectId), index('reviews_ship_idx').on(t.shipId)]
);

export const tractionSources = pgTable(
	'traction_sources',
	{
		id: id(),
		projectId: integer('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		kind: tractionKind('kind').notNull(),
		externalRef: text('external_ref').notNull(), // "owner/repo", package name, ext id
		verified: boolean('verified').notNull().default(false),
		lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
		lastValue: integer('last_value'),
		errorCount: integer('error_count').notNull().default(0),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [uniqueIndex('traction_sources_uq').on(t.projectId, t.kind, t.externalRef)]
);

export const tractionSnapshots = pgTable(
	'traction_snapshots',
	{
		id: id(),
		sourceId: uuid('source_id')
			.notNull()
			.references(() => tractionSources.id, { onDelete: 'cascade' }),
		capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
		value: integer('value').notNull(),
		raw: jsonb('raw')
	},
	(t) => [index('traction_snapshots_source_idx').on(t.sourceId, t.capturedAt.desc())]
);

export const currencyLedger = pgTable(
	'currency_ledger',
	{
		id: id(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		kind: ledgerKind('kind').notNull(),
		// signed sparks; balance = sum(amount) per user
		amount: numeric('amount', { precision: 10, scale: 2, mode: 'number' }).notNull(),
		projectId: integer('project_id').references(() => projects.id),
		shipId: integer('ship_id').references(() => ships.id),
		orderId: integer('order_id'),
		level: integer('level'),
		rate: numeric('rate', { precision: 6, scale: 2, mode: 'number' }),
		hoursBasis: numeric('hours_basis', { precision: 8, scale: 2, mode: 'number' }),
		note: text('note'),
		createdByActorId: text('created_by_actor_id'),
		createdAt: createdAt()
	},
	(t) => [
		index('ledger_user_idx').on(t.userId),
		// payouts + retroactive top-ups are idempotent per (ship, kind, level)
		uniqueIndex('ledger_ship_earn_uq')
			.on(t.shipId, t.kind, t.level)
			.where(sql`${t.kind} in ('earn_ship', 'earn_topup')`),
		uniqueIndex('ledger_order_uq')
			.on(t.orderId, t.kind)
			.where(sql`${t.kind} in ('spend_order', 'refund_order')`)
	]
);

// One-time promotion quests ("share it on Reddit", "polish your repo").
// The unique (project, quest) pair is the idempotency anchor for the ✦1
// earn_quest ledger payout. Quests unlock after the first approved ship.
export const projectQuests = pgTable(
	'project_quests',
	{
		id: id(),
		projectId: integer('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		questId: text('quest_id').notNull(),
		proofUrl: text('proof_url'),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('project_quests_uq').on(t.projectId, t.questId)]
);

// PaperTrail-lite: an append-only record of who did what to what. Written
// fire-and-forget (never blocks or fails the action it describes).
export const auditLogs = pgTable(
	'audit_logs',
	{
		id: id(),
		/** 'user' | 'sidekick' | 'admin' | 'system' */
		actorType: text('actor_type').notNull(),
		/** user id, reviewer actor id, admin email, job name... */
		actorId: text('actor_id'),
		/** dotted verb, e.g. 'ship.create', 'order.cancel', 'admin.set_field' */
		action: text('action').notNull(),
		entityType: text('entity_type'),
		entityId: text('entity_id'),
		/** free-form context: changed fields, amounts, reasons */
		data: jsonb('data'),
		createdAt: createdAt()
	},
	(t) => [index('audit_entity_idx').on(t.entityType, t.entityId), index('audit_created_idx').on(t.createdAt)]
);

export const shopItems = pgTable('shop_items', {
	id: id(),
	name: text('name').notNull(),
	description: text('description').notNull().default(''),
	fulfillerContext: text('fulfiller_context'),
	thumbnailKey: text('thumbnail_key'),
	category: text('category'), // shop filter chips; null = "other"
	price: numeric('price', { precision: 10, scale: 2, mode: 'number' }).notNull(), // sparks
	usdCost: numeric('usd_cost', { precision: 10, scale: 2, mode: 'number' }),
	stock: integer('stock'), // null = unlimited
	onePerUser: boolean('one_per_user').notNull().default(false),
	visible: boolean('visible').notNull().default(true),
	sortOrder: integer('sort_order').notNull().default(0),
	metadata: jsonb('metadata'),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
	deletedAt: timestamp('deleted_at', { withTimezone: true })
});

export const orders = pgTable(
	'orders',
	{
		id: serialId(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		itemId: uuid('item_id')
			.notNull()
			.references(() => shopItems.id),
		quantity: integer('quantity').notNull().default(1),
		totalPrice: numeric('total_price', { precision: 10, scale: 2, mode: 'number' }).notNull(),
		status: orderStatus('status').notNull().default('pending'),
		reference: text('reference'),
		adminNotes: text('admin_notes'),
		userNotes: text('user_notes'),
		fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
		cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('orders_user_idx').on(t.userId),
		index('orders_status_idx').on(t.status),
		index('orders_item_idx').on(t.itemId),
		index('orders_created_idx').on(t.createdAt)
	]
);

export const addressRevealAudits = pgTable(
	'address_reveal_audits',
	{
		id: id(),
		orderId: integer('order_id')
			.notNull()
			.references(() => orders.id),
		revealedAt: timestamp('revealed_at', { withTimezone: true }).notNull().defaultNow(),
		requestIp: text('request_ip')
	},
	(t) => [index('address_audits_order_idx').on(t.orderId)]
);

export const airtableSyncs = pgTable(
	'airtable_syncs',
	{
		id: id(),
		projectId: integer('project_id')
			.notNull()
			.references(() => projects.id),
		shipId: integer('ship_id')
			.notNull()
			.references(() => ships.id),
		reviewId: uuid('review_id').references(() => reviews.id),
		airtableRecordId: text('airtable_record_id'),
		status: syncStatus('status').notNull().default('pending'),
		attempts: integer('attempts').notNull().default(0),
		lastError: text('last_error'),
		syncedAt: timestamp('synced_at', { withTimezone: true }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [uniqueIndex('airtable_syncs_ship_uq').on(t.shipId)]
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Ship = typeof ships.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type TractionSource = typeof tractionSources.$inferSelect;
export type LedgerEntry = typeof currencyLedger.$inferSelect;
export type ShopItem = typeof shopItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
