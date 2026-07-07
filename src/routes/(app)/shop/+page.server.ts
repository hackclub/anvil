import { fail } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { purchase, PurchaseError } from '$lib/server/economy/purchase';
import { publicUrl } from '$lib/server/services/storage';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// zero-spark states: point at shipping (or at patience, if one's in review)
	const [pendingShip] = await db()
		.select({ id: schema.ships.id })
		.from(schema.ships)
		.where(and(eq(schema.ships.userId, locals.user!.id), inArray(schema.ships.status, ['pending', 'pending_hq'])))
		.limit(1);

	const items = await db()
		.select()
		.from(schema.shopItems)
		.where(isNull(schema.shopItems.deletedAt))
		.orderBy(asc(schema.shopItems.sortOrder));

	return {
		hasPendingShip: !!pendingShip,
		items: items
			.filter((i) => i.visible)
			.map((i) => ({
				id: i.id,
				name: i.name,
				description: i.description,
				thumbnailUrl: publicUrl(i.thumbnailKey),
				category: i.category,
				price: i.price,
				onePerUser: i.onePerUser,
				stock: i.stock,
				sortOrder: i.sortOrder
			}))
	};
};

export const actions: Actions = {
	purchase: async ({ locals, request }) => {
		const form = await request.formData();
		const itemId = String(form.get('itemId') ?? '');
		const quantity = Number(form.get('quantity') ?? 1);
		const notes =
			String(form.get('notes') ?? '')
				.trim()
				.slice(0, 500) || null;

		try {
			const { orderId } = await purchase(locals.user!, itemId, quantity, notes);
			return { ordered: true, orderId };
		} catch (err) {
			if (err instanceof PurchaseError) return fail(400, { error: err.message, itemId });

			throw err;
		}
	}
};
