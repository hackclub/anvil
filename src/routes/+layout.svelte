<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { theme } from '$lib/theme.svelte';
	import { soundOnClick } from '$lib/sound';
	import { createLogger } from '$lib/log';

	let { children } = $props();

	const log = createLogger('nav');

	onMount(() => {
		theme.init();
		log.info('app mounted', { path: location.pathname });
	});

	// Client-side navigation trail: one log per SPA navigation (and the initial
	// load), so a client session reads as a breadcrumb path in the logs/Sentry.
	afterNavigate((nav) => {
		log.info('navigated', {
			from: nav.from?.url.pathname ?? null,
			to: nav.to?.url.pathname ?? null,
			type: nav.type
		});
	});
</script>

<svelte:window onclickcapture={soundOnClick} />

{@render children()}
