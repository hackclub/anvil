import { handleErrorWithSentry, replayIntegration } from '@sentry/sveltekit';
import * as Sentry from '@sentry/sveltekit';
import type { HandleClientError } from '@sveltejs/kit';
import { createLogger } from '$lib/log';

Sentry.init({
	dsn: 'https://5bfa823661b8eaefde4fc1e6a260d0cf@o4510225758814208.ingest.us.sentry.io/4511706862518272',

	tracesSampleRate: 1.0,

	// Enable logs to be sent to Sentry
	enableLogs: true,

	dataCollection: {
		// To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
		// https://docs.sentry.io/platforms/javascript/guides/sveltekit/configuration/options/#dataCollection
		// userInfo: false,
		// httpBodies: [],
	}
});

const log = createLogger('client');

// Report client-side render/navigation errors to BOTH the browser console (with
// route context) and Sentry. handleErrorWithSentry captures the exception as an
// Issue itself, then calls this handler - so capture:false avoids a duplicate.
export const handleError = handleErrorWithSentry((input: Parameters<HandleClientError>[0]) => {
	const { error, event, status, message } = input;
	log.error('unhandled client error', {
		err: error,
		capture: false,
		path: event.url?.pathname,
		status,
		message
	});
});
