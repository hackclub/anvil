import { redirect } from '@sveltejs/kit';
import { publicUser } from '$lib/server/publicUser';
import { avatarUrl, gravatarUrl } from '$lib/server/avatar';
import { balanceOf } from '$lib/server/economy/ledger';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url, route }) => {
	if (!locals.user) {
		redirect(302, `/auth/login?next=${encodeURIComponent(url.pathname)}`);
	}

	// Onboarding gates: (1) IDV - verified teens pass; pending pass too (with
	// a nag banner) so they can work on projects while they wait. (2) hackatime
	// - without an account nothing can be tracked or rewarded, so everyone is
	// held at /onboarding until one exists.
	const u = locals.user;
	const verOk = u.yswsEligible || u.verificationStatus === 'pending';
	const passes = verOk && !!u.hackatimeId;
	const onOnboarding = route.id?.includes('/onboarding') ?? false;
	if (!passes && !onOnboarding) redirect(302, '/onboarding');

	if (passes && onOnboarding) redirect(302, '/dashboard');

	return {
		user: publicUser(u),
		// slack avatar (Cachet), with a gravatar identicon fallback on load error
		avatar: avatarUrl(u.slackId, u.email),
		avatarFallback: gravatarUrl(u.email),
		balance: await balanceOf(u.id),
		verificationNag: !u.yswsEligible && u.verificationStatus === 'pending'
	};
};
