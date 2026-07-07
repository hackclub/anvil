// "check status" - re-pull verification from HCA's public check endpoint
// into OUR db, then bounce back to wherever the user pressed the button.
import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { checkVerification } from '$lib/server/auth/hca';
import { db, schema } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = locals.user;
	if (user) {
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
	}

	let back = '/dashboard';
	try {
		back = new URL(request.headers.get('referer') ?? '').pathname || back;
	} catch {
		// no/odd referer - dashboard it is
	}

	redirect(303, back);
};
