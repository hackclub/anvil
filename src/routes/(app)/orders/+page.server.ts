import { fail } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { publicUrl } from '$lib/server/services/storage';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const rows = await db()
		.select()
		.from(schema.orders)
		.innerJoin(schema.shopItems, eq(schema.orders.itemId, schema.shopItems.id))
		.where(eq(schema.orders.userId, locals.user!.id))
		.orderBy(desc(schema.orders.createdAt));

	return {
		orders: rows.map((r) => ({
			id: r.orders.id,
			itemName: r.shop_items.name,
			thumbnailUrl: publicUrl(r.shop_items.thumbnailKey),
			quantity: r.orders.quantity,
			totalPrice: r.orders.totalPrice,
			status: r.orders.status,
			userNotes: r.orders.userNotes,
			reference: r.orders.reference,
			createdAt: r.orders.createdAt.toISOString(),
			fulfilledAt: r.orders.fulfilledAt?.toISOString() ?? null
		}))
	};
};

export const actions: Actions = {
	// users may cancel their own PENDING orders - sparks come straight back.
	// the refund is idempotent via the unique (order_id, kind) ledger index.
	cancel: async ({ locals, request }) => {
		const form = await request.formData();
		const orderId = Number(form.get('orderId'));
		const [order] = await db()
			.select()
			.from(schema.orders)
			.where(and(eq(schema.orders.id, orderId), eq(schema.orders.userId, locals.user!.id)));

		if (!order) return fail(404, { error: 'order not found' });

		if (order.status !== 'pending') {
			return fail(400, { error: 'only pending orders can be cancelled' });
		}

		await db()
			.update(schema.orders)
			.set({ status: 'cancelled', cancelledAt: new Date() })
			.where(eq(schema.orders.id, order.id));

		await db()
			.insert(schema.currencyLedger)
			.values({
				userId: order.userId,
				kind: 'refund_order',
				amount: order.totalPrice,
				orderId: order.id
			})
			.onConflictDoNothing();

		audit({
			actorType: 'user',
			actorId: locals.user!.id,
			action: 'order.cancel',
			entityType: 'order',
			entityId: orderId
		});

		return { cancelled: true };
	},

	// notes for the fulfillers (e.g. "the red one please!") - editable while
	// the order is still pending
	note: async ({ locals, request }) => {
		const form = await request.formData();
		const orderId = Number(form.get('orderId'));
		const notes =
			String(form.get('notes') ?? '')
				.trim()
				.slice(0, 500) || null;

		const updated = await db()
			.update(schema.orders)
			.set({ userNotes: notes })
			.where(
				and(
					eq(schema.orders.id, orderId),
					eq(schema.orders.userId, locals.user!.id),
					eq(schema.orders.status, 'pending')
				)
			)
			.returning({ id: schema.orders.id });

		if (updated.length === 0) return fail(400, { error: 'only pending orders can be updated' });

		audit({
			actorType: 'user',
			actorId: locals.user!.id,
			action: 'order.note',
			entityType: 'order',
			entityId: orderId
		});

		return { noted: true };
	}
};
