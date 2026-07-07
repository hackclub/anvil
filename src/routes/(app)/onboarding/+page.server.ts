import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { checkVerification } from '$lib/server/auth/hca';
import { ensureHackatimeLinked } from '$lib/server/services/hackatimeLink';
import { db, schema } from '$lib/server/db';
import type { Actions } from './$types';

export const actions: Actions = {
	refresh: async ({ locals }) => {
		const user = locals.user!;
		const result = await checkVerification(user.hcaId);
		if (result) {
			await db()
				.update(schema.users)
				.set({
					verificationStatus: result.status,
					yswsEligible: result.eligible,
					verificationRefreshedAt: new Date()
				})
				.where(eq(schema.users.id, user.id));
		}

		return { refreshed: true };
	},

	// the hackatime gate's "i made one - find it!": resolve their account via
	// slack id / email, then let the layout gate wave them through
	findHackatime: async ({ locals }) => {
		const user = locals.user!;
		let id: string | null = null;
		try {
			id = await ensureHackatimeLinked(user);
		} catch {
			// hackatime hiccup - treat as not found
		}

		if (id) redirect(303, '/dashboard');

		return { hkNotFound: true };
	}
};
