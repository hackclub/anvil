<script lang="ts">
	// Braille spinner in the TUI style. Render it only when work has been
	// pending long enough to warrant feedback (see $lib/pending.svelte.ts).
	let { label = '' }: { label?: string } = $props();

	const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
	let i = $state(0);

	$effect(() => {
		const t = setInterval(() => (i = (i + 1) % frames.length), 80);
		return () => clearInterval(t);
	});
</script>

<span class="spin" role="status" aria-live="polite">
	{frames[i]}{#if label}&nbsp;{label}{/if}
</span>

<style>
	.spin {
		color: var(--accent);
		white-space: nowrap;
	}
</style>
