<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { theme } from '$lib/theme.svelte';
	import { soundOnClick } from '$lib/sound';

	let { children } = $props();

	onMount(() => {
		theme.init();
	});
</script>

<svelte:window onclickcapture={soundOnClick} />

{@render children()}
