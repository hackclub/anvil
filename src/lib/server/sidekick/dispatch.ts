import { and, asc, count, desc, eq, exists, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { createLogger } from '$lib/log';
import { db, schema } from '../db';
import { fetchLiveProfile } from '../auth/hca';
import { audit } from '../audit';
import type { Order, Project, ShopItem, User } from '../db/schema';
import { absoluteUrl } from '../services/storage';
import { dmOrderStatus } from '../services/slackNotify';
import { decodeCursor, encodeCursor } from './cursor';
import { actorIdFor, reviewEvent, serializeProject, shipEvent } from './serialize';
import { SidekickError, submitReviewAction, updateReviewAction } from './reviewActions';

type Json = Record<string, unknown>;

const log = createLogger('sidekick');

// every mutating protocol action lands in the audit trail
const MUTATING = new Set([
	'SUBMIT_REVIEW_ACTION',
	'UPDATE_REVIEW_ACTION',
	'REVEAL_ORDER_ADDRESS',
	'UPDATE_ORDER_STATUS',
	'UPDATE_ORDER_FIELDS',
	'UPDATE_ITEM_FIELDS'
]);

export async function dispatch(action: string, input: Json): Promise<Json> {
	const start = performance.now();
	const mutating = MUTATING.has(action);
	log.info('action', {
		action,
		mutating,
		reviewerId: typeof input.reviewerId === 'string' ? input.reviewerId : null
	});
	let result: Json;
	try {
		result = await dispatchInner(action, input);
	} catch (err) {
		// SidekickError is an expected protocol rejection (validation/not-found);
		// the endpoint maps it to 4xx, so it's a warn, not a captured exception.
		if (err instanceof SidekickError) {
			log.warn('action rejected', { action, code: err.code, ms: Math.round(performance.now() - start) });
		} else {
			log.exception('action threw', err, { action, ms: Math.round(performance.now() - start) });
		}

		throw err;
	}
	log.info('action ok', { action, mutating, ms: Math.round(performance.now() - start) });
	if (MUTATING.has(action)) {
		audit({
			actorType: 'sidekick',
			actorId: typeof input.reviewerId === 'string' ? input.reviewerId : null,
			action: `sidekick.${action.toLowerCase()}`,
			entityType:
				input.shipId != null
					? 'ship'
					: input.orderId != null
						? 'order'
						: input.itemId != null
							? 'shop_item'
							: undefined,
			entityId: String(input.shipId ?? input.orderId ?? input.itemId ?? ''),
			data: { input: { ...input, __requestIp: undefined } }
		});
	}

	return result;
}

async function dispatchInner(action: string, input: Json): Promise<Json> {
	switch (action) {
		case 'HEALTH_CHECK':
			return { ok: true, version: '1.0.0' };
		case 'GET_PROGRAM_STATS':
			return programStats();
		case 'FETCH_PROJECTS':
			return fetchProjects(input);
		case 'FETCH_PROJECT_DETAIL':
			return fetchProjectDetail(intId(input, 'projectId'));
		case 'FETCH_PROJECT_TIMELINE':
			return fetchProjectTimeline(intId(input, 'projectId'));
		case 'SUBMIT_REVIEW_ACTION': {
			const event = await submitReviewAction({ ...input, shipId: intId(input, 'shipId') } as never);
			return { success: true, event };
		}
		case 'UPDATE_REVIEW_ACTION': {
			await updateReviewAction({ ...input, shipId: intId(input, 'shipId') } as never);
			return { success: true };
		}
		case 'FETCH_SHOP_ITEMS':
			return fetchShopItems();
		case 'FETCH_ORDERS':
			return fetchOrders(input);
		case 'FETCH_ORDER_DETAIL':
			return fetchOrderDetail(intId(input, 'orderId'));
		case 'REVEAL_ORDER_ADDRESS':
			return revealOrderAddress(intId(input, 'orderId'), str(input, '__requestIp', ''));
		case 'UPDATE_ORDER_STATUS':
			return updateOrderStatus(input);
		case 'UPDATE_ORDER_FIELDS':
			return updateOrderFields(input);
		case 'UPDATE_ITEM_FIELDS':
			return updateItemFields(input);
		default: {
			throw new SidekickError('VALIDATION_ERROR', `Unknown action: ${action}`);
		}
	}
}

function str(input: Json, key: string, fallback?: string): string {
	const v = input[key];
	if (typeof v === 'string') return v;

	if (fallback !== undefined) return fallback;

	throw new SidekickError('VALIDATION_ERROR', `missing required field: ${key}`);
}

/** Integer entity id - Sidekick may send it as a string or a number. */
function intId(input: Json, key: string): number {
	const v = input[key];
	const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
	if (!Number.isInteger(n)) {
		throw new SidekickError('VALIDATION_ERROR', `missing or invalid field: ${key}`);
	}

	return n;
}

// ── stats ─────────────────────────────────────────────────────────────────

async function programStats(): Promise<Json> {
	const [pendingReview] = await db()
		.select({ n: count() })
		.from(schema.projects)
		.where(eq(schema.projects.shipStatus, 'pending'));

	// prettier-ignore
	const [pendingHq] = await db()
		.select({ n: count() })
		.from(schema.ships)
		.where(eq(schema.ships.status, 'pending_hq'));

	const [pendingFulfillment] = await db()
		.select({ n: count() })
		.from(schema.orders)
		.where(eq(schema.orders.status, 'pending'));

	return {
		pendingReviewCount: pendingReview.n,
		pendingHqCount: pendingHq.n,
		pendingFulfillmentCount: pendingFulfillment.n
	};
}

// ── projects ──────────────────────────────────────────────────────────────

async function serializeProjectRow(project: Project, owner: User): Promise<Json> {
	const keys = await db()
		.select({ key: schema.hackatimeProjectLinks.hackatimeKey })
		.from(schema.hackatimeProjectLinks)
		.where(eq(schema.hackatimeProjectLinks.projectId, project.id));

	const ships = await db()
		.select()
		.from(schema.ships)
		.where(eq(schema.ships.projectId, project.id))
		.orderBy(asc(schema.ships.shipNumber));

	return serializeProject(
		project,
		owner,
		keys.map((k) => k.key),
		ships
	);
}

async function fetchProjects(input: Json): Promise<Json> {
	const status = typeof input.status === 'string' ? input.status : 'all';
	const limit = Math.min(Number(input.limit) || 50, 100);
	const cursor = decodeCursor(input.cursor as string | undefined);

	const wantedStatuses = status === 'all' ? ['pending', 'pending_hq', 'approved', 'rejected'] : [status];

	const hasWantedShip = exists(
		db()
			.select({ one: sql`1` })
			.from(schema.ships)
			.where(and(eq(schema.ships.projectId, schema.projects.id), inArray(schema.ships.status, wantedStatuses as never)))
	);

	const where = and(
		isNull(schema.projects.deletedAt),
		hasWantedShip,
		cursor
			? or(
					lt(schema.projects.createdAt, new Date(cursor.t)),
					and(eq(schema.projects.createdAt, new Date(cursor.t)), lt(schema.projects.id, Number(cursor.id)))
				)
			: undefined
	);

	const [total] = await db()
		.select({ n: count() })
		.from(schema.projects)
		.where(and(isNull(schema.projects.deletedAt), hasWantedShip));

	const rows = await db()
		.select()
		.from(schema.projects)
		.innerJoin(schema.users, eq(schema.projects.userId, schema.users.id))
		.where(where)
		.orderBy(desc(schema.projects.createdAt), desc(schema.projects.id))
		.limit(limit + 1);

	const page = rows.slice(0, limit);
	const projects = await Promise.all(page.map((r) => serializeProjectRow(r.projects, r.users)));

	const result: Json = { projects, totalCount: total.n };
	if (rows.length > limit) {
		const last = page[page.length - 1].projects;
		result.nextCursor = encodeCursor({ t: last.createdAt.getTime(), id: last.id });
	}

	return result;
}

async function getProjectWithOwner(projectId: number) {
	const [row] = await db()
		.select()
		.from(schema.projects)
		.innerJoin(schema.users, eq(schema.projects.userId, schema.users.id))
		.where(and(eq(schema.projects.id, projectId), isNull(schema.projects.deletedAt)));

	if (!row) throw new SidekickError('NOT_FOUND', `no project with id ${projectId}`);

	return row;
}

async function fetchProjectDetail(projectId: number): Promise<Json> {
	const row = await getProjectWithOwner(projectId);
	return serializeProjectRow(row.projects, row.users);
}

async function fetchProjectTimeline(projectId: number): Promise<Json> {
	const row = await getProjectWithOwner(projectId);
	const ownerActorId = actorIdFor(row.users);

	const ships = await db()
		.select()
		.from(schema.ships)
		.where(eq(schema.ships.projectId, projectId))
		.orderBy(asc(schema.ships.shipNumber));

	const reviews = await db()
		.select()
		.from(schema.reviews)
		.where(
			and(
				eq(schema.reviews.projectId, projectId),
				isNull(schema.reviews.deletedAt),
				eq(schema.reviews.held, false) // held approvals aren't decisions yet
			)
		)
		.orderBy(asc(schema.reviews.createdAt));

	const events = [
		...ships.map((s, i) => shipEvent(s, i > 0 ? ships[i - 1] : null, ownerActorId)),
		...reviews.map(reviewEvent)
	].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

	return { events };
}

// ── shop / orders ─────────────────────────────────────────────────────────

function serializeItem(item: ShopItem): Json {
	return {
		id: item.id,
		name: item.name,
		description: item.description,
		fulfillerContext: item.fulfillerContext ?? undefined,
		thumbnailUrl: absoluteUrl(item.thumbnailKey) ?? undefined,
		unitPrice: item.usdCost ?? undefined,
		metadata: { sparksPrice: item.price, stock: item.stock, visible: item.visible }
	};
}

function serializeOrder(order: Order, user: User): Json {
	return {
		id: String(order.id),
		userId: actorIdFor(user),
		userName: user.username ?? user.email,
		userEmail: user.email,
		itemId: order.itemId,
		quantity: order.quantity,
		totalPrice: order.totalPrice,
		status: order.status,
		reference: order.reference ?? undefined,
		adminNotes: order.adminNotes ?? undefined,
		userNotes: order.userNotes ?? undefined,
		createdAt: order.createdAt.toISOString(),
		fulfilledAt: order.fulfilledAt?.toISOString() ?? undefined,
		metadata: {}
	};
}

async function fetchShopItems(): Promise<Json> {
	const items = await db()
		.select()
		.from(schema.shopItems)
		.where(isNull(schema.shopItems.deletedAt))
		.orderBy(asc(schema.shopItems.sortOrder));

	return { items: items.map(serializeItem) };
}

async function fetchOrders(input: Json): Promise<Json> {
	const limit = Math.min(Number(input.limit) || 50, 100);
	const cursor = decodeCursor(input.cursor as string | undefined);
	const sortBy = typeof input.sortBy === 'string' ? input.sortBy : 'date';
	const sortOrder = input.sortOrder === 'desc' ? 'desc' : 'asc';

	const filters = [
		typeof input.status === 'string' && input.status !== 'all'
			? eq(schema.orders.status, input.status as Order['status'])
			: undefined,
		typeof input.filterItemId === 'string' && input.filterItemId
			? eq(schema.orders.itemId, input.filterItemId)
			: undefined,
		typeof input.searchUser === 'string' && input.searchUser
			? or(ilike(schema.users.email, `%${input.searchUser}%`), ilike(schema.users.username, `%${input.searchUser}%`))
			: undefined
	].filter(Boolean);

	const offset = cursor?.t ?? 0;

	const sortCol =
		{
			id: schema.orders.id,
			user: schema.users.username,
			item: schema.shopItems.name,
			quantity: schema.orders.quantity,
			date: schema.orders.createdAt,
			status: schema.orders.status
		}[sortBy] ?? schema.orders.createdAt;

	const base = db()
		.select()
		.from(schema.orders)
		.innerJoin(schema.users, eq(schema.orders.userId, schema.users.id))
		.innerJoin(schema.shopItems, eq(schema.orders.itemId, schema.shopItems.id))
		.where(and(...filters));

	const [total] = await db()
		.select({ n: count() })
		.from(schema.orders)
		.innerJoin(schema.users, eq(schema.orders.userId, schema.users.id))
		.where(and(...filters));

	const rows = await base
		.orderBy(sortOrder === 'desc' ? desc(sortCol) : asc(sortCol), asc(schema.orders.id))
		.limit(limit + 1)
		.offset(offset);

	const page = rows.slice(0, limit);
	const items: Record<string, Json> = {};
	for (const r of page) items[r.shop_items.id] = serializeItem(r.shop_items);

	const result: Json = {
		orders: page.map((r) => serializeOrder(r.orders, r.users)),
		items,
		totalCount: total.n
	};

	if (rows.length > limit) {
		result.nextCursor = encodeCursor({ t: offset + limit, id: '' });
	}

	return result;
}

async function getOrder(orderId: number) {
	const [row] = await db()
		.select()
		.from(schema.orders)
		.innerJoin(schema.users, eq(schema.orders.userId, schema.users.id))
		.innerJoin(schema.shopItems, eq(schema.orders.itemId, schema.shopItems.id))
		.where(eq(schema.orders.id, orderId));

	if (!row) throw new SidekickError('NOT_FOUND', `no order with id ${orderId}`);

	return row;
}

async function fetchOrderDetail(orderId: number): Promise<Json> {
	const row = await getOrder(orderId);
	return { order: serializeOrder(row.orders, row.users), item: serializeItem(row.shop_items) };
}

async function revealOrderAddress(orderId: number, requestIp: string): Promise<Json> {
	const row = await getOrder(orderId);

	// live-at-reveal: we hold NO address at rest - it comes straight from HCA
	// every time, so fulfillers always ship to the current verified address
	let profile;
	try {
		profile = await fetchLiveProfile(row.users);
	} catch (err) {
		throw new SidekickError(
			'INTERNAL_ERROR',
			`couldn't fetch the address from HCA (${err instanceof Error ? err.message : err}) - ` +
				'if the token expired, the user needs to log in to anvil again'
		);
	}

	await db().insert(schema.addressRevealAudits).values({ orderId, requestIp });

	return {
		firstName: profile.legalFirstName ?? profile.firstName ?? '',
		lastName: profile.legalLastName ?? profile.lastName ?? '',
		line1: profile.addressLine1 ?? '',
		line2: profile.addressLine2 ?? undefined,
		city: profile.addressCity ?? '',
		stateProvince: profile.addressState ?? undefined,
		postalCode: profile.addressPostalCode ?? '',
		country: profile.addressCountry ?? '',
		phoneNumber: profile.phoneNumber ?? undefined
	};
}

async function updateOrderStatus(input: Json): Promise<Json> {
	const orderId = intId(input, 'orderId');
	const newStatus = str(input, 'newStatus');
	if (!['pending', 'fulfilled', 'cancelled'].includes(newStatus)) {
		throw new SidekickError('VALIDATION_ERROR', `invalid status: ${newStatus}`);
	}

	const row = await getOrder(orderId);

	await db()
		.update(schema.orders)
		.set({
			status: newStatus as Order['status'],
			...(typeof input.reference === 'string' ? { reference: input.reference } : {}),
			...(newStatus === 'fulfilled' ? { fulfilledAt: new Date() } : {}),
			...(newStatus === 'cancelled' ? { cancelledAt: new Date() } : {})
		})
		.where(eq(schema.orders.id, orderId));

	// cancelling refunds the sparks (idempotent via unique (order_id, kind))
	if (newStatus === 'cancelled' && row.orders.status !== 'cancelled') {
		await db()
			.insert(schema.currencyLedger)
			.values({
				userId: row.orders.userId,
				kind: 'refund_order',
				amount: row.orders.totalPrice,
				orderId
			})
			.onConflictDoNothing();
	}

	// DM only on a real transition - re-saving the same status stays silent
	if (newStatus !== row.orders.status) {
		scheduleOrderStatusDm(orderId);
	}

	return { success: true };
}

// Sidekick's order-save endpoint calls UPDATE_ORDER_STATUS first and
// UPDATE_ORDER_FIELDS right after when both changed. Delay the status DM a
// beat and re-read the order, so the fulfiller's note (userNotes) rides
// along in ONE combined message instead of two back-to-back DMs.
const pendingStatusDm = new Set<number>();

function scheduleOrderStatusDm(orderId: number): void {
	pendingStatusDm.add(orderId);
	setTimeout(async () => {
		pendingStatusDm.delete(orderId);
		try {
			const row = await getOrder(orderId);
			dmOrderStatus(
				row.users,
				{ id: orderId, status: row.orders.status },
				row.shop_items.name,
				row.orders.reference ?? undefined,
				row.orders.userNotes ?? undefined
			);
		} catch (err) {
			log.warn('order status DM failed', { err, capture: false, orderId });
		}
	}, 2000);
}

async function updateOrderFields(input: Json): Promise<Json> {
	const orderId = intId(input, 'orderId');
	const row = await getOrder(orderId);
	await db()
		.update(schema.orders)
		.set({
			...(typeof input.reference === 'string' ? { reference: input.reference } : {}),
			...(typeof input.adminNotes === 'string' ? { adminNotes: input.adminNotes } : {}),
			...(typeof input.userNotes === 'string' ? { userNotes: input.userNotes } : {})
		})
		.where(eq(schema.orders.id, orderId));
	// userNotes are written FOR the participant - deliver them by re-sending
	// the fulfilled/cancelled message with the note attached. When a status
	// DM is already pending for this order it re-reads the row and carries
	// the note, so sending here would be a duplicate. Notes on still-pending
	// orders stay quiet (dmOrderStatus only speaks for decided orders).
	if (
		typeof input.userNotes === 'string' &&
		input.userNotes.trim() !== (row.orders.userNotes ?? '').trim() &&
		input.userNotes.trim() &&
		!pendingStatusDm.has(orderId)
	) {
		dmOrderStatus(
			row.users,
			{ id: orderId, status: row.orders.status },
			row.shop_items.name,
			(typeof input.reference === 'string' ? input.reference : row.orders.reference) ?? undefined,
			input.userNotes
		);
	}

	return { success: true };
}

async function updateItemFields(input: Json): Promise<Json> {
	const itemId = str(input, 'itemId');
	// prettier-ignore
	const [item] = await db()
		.select()
		.from(schema.shopItems)
		.where(eq(schema.shopItems.id, itemId));
	if (!item) throw new SidekickError('NOT_FOUND', `no item with id ${itemId}`);

	await db()
		.update(schema.shopItems)
		.set({
			...(typeof input.fulfillerContext === 'string' ? { fulfillerContext: input.fulfillerContext } : {})
		})
		.where(eq(schema.shopItems.id, itemId));

	return { success: true };
}
