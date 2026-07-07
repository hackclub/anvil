import { redirect } from '@sveltejs/kit';
import { optional } from '$lib/server/env';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	redirect(302, optional('HELP_SLACK_URL', 'https://hackclub.com/slack'));
};
