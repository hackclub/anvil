import * as Sentry from '@sentry/sveltekit';

Sentry.init({
	dsn: 'https://5bfa823661b8eaefde4fc1e6a260d0cf@o4510225758814208.ingest.us.sentry.io/4511706862518272',

	tracesSampleRate: 1.0,

	// Enable logs to be sent to Sentry
	enableLogs: true

	// uncomment the line below to enable Spotlight (https://spotlightjs.com)
	// spotlight: import.meta.env.DEV,
});
