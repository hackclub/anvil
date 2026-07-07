// Public peek at the shop catalog for the marketing homepage carousel.
// Names + prices only; returns [] gracefully in DB-less marketing mode.
import { json } from '@sveltejs/kit';
import { asc, isNull } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { publicUrl } from '$lib/server/services/storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const items = await db()
			.select({
				name: schema.shopItems.name,
				price: schema.shopItems.price,
				thumbnailKey: schema.shopItems.thumbnailKey,
				visible: schema.shopItems.visible
			})
			.from(schema.shopItems)
			.where(isNull(schema.shopItems.deletedAt))
			.orderBy(asc(schema.shopItems.sortOrder))
			.limit(60);

		return json(
			items
				.filter((i) => i.visible)
				.map((i) => ({ name: i.name, price: i.price, thumbnailUrl: publicUrl(i.thumbnailKey) })),
			{ headers: { 'cache-control': 'public, max-age=300' } }
		);
	} catch {
		return json([]);
	}
};
