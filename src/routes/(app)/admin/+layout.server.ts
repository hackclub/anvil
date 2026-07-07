import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// 404 (not 403) - don't advertise the admin panel's existence
	if (!locals.user?.isAdmin) error(404, 'Not Found');

	return {};
};
