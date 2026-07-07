// Purchasing: balance check + spend + order creation under a per-user
// advisory lock, so concurrent purchases can't double-spend sparks.
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { fetchLiveProfile } from '../auth/hca';
import { audit } from '../audit';
import type { User } from '../db/schema';

export class PurchaseError extends Error {}

export async function purchase(
	user: User,
	itemId: string,
	quantity: number,
	userNotes: string | null = null
): Promise<{ orderId: number }> {
	if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
		throw new PurchaseError('quantity must be between 1 and 10');
	}

	if (!user.yswsEligible) {
		throw new PurchaseError('identity verification must clear before ordering');
	}

	// address lives in HCA only (no PII at rest) - check it live before
	// taking sparks, so fulfillment can't strand an order without one
	let hasAddress = false;
	try {
		const p = await fetchLiveProfile(user);
		hasAddress = !!(p.addressLine1 && p.addressCity && p.addressCountry);
	} catch {
		throw new PurchaseError("couldn't reach Hack Club Auth to check your address - re-login and try again");
	}

	if (!hasAddress) {
		throw new PurchaseError('no shipping address on file - add one at auth.hackclub.com first');
	}

	return await db().transaction(async (tx) => {
		// serialize purchases per user (lock released at tx end)
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);

		const [item] = await tx
			.select()
			.from(schema.shopItems)
			.where(and(eq(schema.shopItems.id, itemId), isNull(schema.shopItems.deletedAt)));

		if (!item || !item.visible) throw new PurchaseError('item not found');

		if (item.onePerUser) {
			if (quantity > 1) throw new PurchaseError('this item is limited to one per person');

			const [prior] = await tx
				.select({ n: count() })
				.from(schema.orders)
				.where(
					and(
						eq(schema.orders.userId, user.id),
						eq(schema.orders.itemId, item.id),
						sql`${schema.orders.status} != 'cancelled'`
					)
				);

			if (prior.n > 0) throw new PurchaseError('you already ordered this one');
		}

		if (item.stock != null) {
			const [soldRow] = await tx
				.select({ n: sql<string>`coalesce(sum(${schema.orders.quantity}), 0)` })
				.from(schema.orders)
				.where(and(eq(schema.orders.itemId, item.id), sql`${schema.orders.status} != 'cancelled'`));

			if (Number(soldRow.n) + quantity > item.stock) throw new PurchaseError('out of stock');
		}

		const total = Math.round(item.price * quantity * 100) / 100;
		const [balRow] = await tx
			.select({ balance: sql<string>`coalesce(sum(${schema.currencyLedger.amount}), 0)` })
			.from(schema.currencyLedger)
			.where(eq(schema.currencyLedger.userId, user.id));

		if (Number(balRow.balance) < total) {
			throw new PurchaseError(`not enough sparks - this costs ${total}, you have ${Number(balRow.balance)}`);
		}

		const [order] = await tx
			.insert(schema.orders)
			.values({ userId: user.id, itemId: item.id, quantity, totalPrice: total, userNotes })
			.returning();

		await tx.insert(schema.currencyLedger).values({
			userId: user.id,
			kind: 'spend_order',
			amount: -total,
			orderId: order.id
		});

		audit({
			actorType: 'user',
			actorId: user.id,
			action: 'order.create',
			entityType: 'order',
			entityId: order.id,
			data: { itemId: item.id, itemName: item.name, quantity, total }
		});

		return { orderId: order.id };
	});
}
