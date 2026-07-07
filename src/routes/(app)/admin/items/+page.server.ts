import { fail } from '@sveltejs/kit';
import { asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '$lib/server/db';
import { publicUrl, storeUpload, UploadError } from '$lib/server/services/storage';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

const itemSchema = z.object({
	name: z.string().trim().min(1).max(80),
	description: z.string().trim().max(1000).default(''),
	category: z.string().trim().max(40).default(''),
	price: z.coerce.number().positive(),
	usdCost: z.coerce.number().nonnegative().optional(),
	stock: z.union([z.literal(''), z.coerce.number().int().nonnegative()]).default(''),
	onePerUser: z.coerce.boolean().default(false),
	visible: z.coerce.boolean().default(true),
	sortOrder: z.coerce.number().int().default(0)
});

async function parseItem(form: FormData) {
	return itemSchema.safeParse({
		name: String(form.get('name') ?? ''),
		description: String(form.get('description') ?? ''),
		category: String(form.get('category') ?? ''),
		price: form.get('price'),
		usdCost: form.get('usdCost') || undefined,
		stock: String(form.get('stock') ?? ''),
		onePerUser: form.get('onePerUser') === 'on',
		visible: form.get('visible') === 'on',
		sortOrder: form.get('sortOrder') || 0
	});
}

export const load: PageServerLoad = async () => {
	const items = await db()
		.select()
		.from(schema.shopItems)
		.where(isNull(schema.shopItems.deletedAt))
		.orderBy(asc(schema.shopItems.sortOrder));

	return {
		items: items.map((i) => ({
			id: i.id,
			name: i.name,
			thumbnailUrl: publicUrl(i.thumbnailKey),
			category: i.category ?? '',
			description: i.description,
			fulfillerContext: i.fulfillerContext ?? '',
			price: i.price,
			usdCost: i.usdCost,
			stock: i.stock,
			onePerUser: i.onePerUser,
			visible: i.visible,
			sortOrder: i.sortOrder
		}))
	};
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = await parseItem(form);
		if (!parsed.success) return fail(400, { error: parsed.error.issues[0].message });

		let thumbnailKey: string | undefined;
		const thumb = form.get('thumbnail');
		if (thumb instanceof File && thumb.size > 0 && thumb.type.startsWith('image/')) {
			try {
				thumbnailKey = (await storeUpload(thumb, 'items')).key;
			} catch (e) {
				if (e instanceof UploadError) return fail(400, { error: e.message });

				throw e;
			}
		}

		const d = parsed.data;
		const values = {
			name: d.name,
			description: d.description,
			category: d.category || null,
			fulfillerContext: String(form.get('fulfillerContext') ?? '') || null,
			price: d.price,
			usdCost: d.usdCost ?? null,
			stock: d.stock === '' ? null : d.stock,
			onePerUser: d.onePerUser,
			visible: d.visible,
			sortOrder: d.sortOrder,
			...(thumbnailKey ? { thumbnailKey } : {})
		};

		const id = String(form.get('id') ?? '');

		if (id) {
			// prettier-ignore
			await db()
				.update(schema.shopItems)
				.set(values)
				.where(eq(schema.shopItems.id, id));
		} else {
			await db().insert(schema.shopItems).values(values);
		}

		audit({
			actorType: 'admin',
			actorId: locals.user!.email,
			action: id ? 'admin.item_update' : 'admin.item_create',
			entityType: 'shop_item',
			entityId: id || undefined,
			data: { name: d.name, price: d.price, visible: d.visible }
		});

		return { saved: true };
	},

	remove: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		await db()
			.update(schema.shopItems)
			.set({ deletedAt: new Date(), visible: false })
			.where(eq(schema.shopItems.id, id));

		audit({
			actorType: 'admin',
			actorId: locals.user!.email,
			action: 'admin.item_delete',
			entityType: 'shop_item',
			entityId: id
		});

		return { saved: true };
	}
};
