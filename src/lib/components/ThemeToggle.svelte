<script lang="ts">
	import { theme } from '$lib/theme.svelte';
</script>

<button
	class="toggle"
	title="switch palette"
	onclick={() => theme.cycle()}
	aria-label="switch color palette (current: {theme.current.name})"
>
	<span class="chev">▚</span>
	{theme.current.name}
</button>

<style>
	.toggle {
		position: fixed;
		right: 0.9rem;
		bottom: 0.9rem;
		z-index: 50;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--dim);
		background: color-mix(in srgb, var(--bg) 70%, transparent);
		border: 1px solid var(--dim);
		padding: 0.35em 0.6em;
		cursor: pointer;
		backdrop-filter: blur(4px);
		transition:
			color 0.1s ease,
			border-color 0.1s ease;

		&:hover {
			color: var(--accent);
			border-color: var(--accent);
		}
	}

	.chev {
		color: var(--accent);
	}
</style>
