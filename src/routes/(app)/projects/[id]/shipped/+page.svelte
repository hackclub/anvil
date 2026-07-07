<script lang="ts">
	import { onMount } from 'svelte';
	import ShippedFx from '$lib/ascii/ShippedFx.svelte';
	import { playShipped } from '$lib/sound';

	let { data } = $props();

	// staggered reveal, timed to the impact at 500ms
	let showTitle = $state(false);
	let showBody = $state(false);
	let showBtn = $state(false);

	onMount(() => {
		playShipped();
		const timers = [
			setTimeout(() => (showTitle = true), 650),
			setTimeout(() => (showBody = true), 1250),
			setTimeout(() => (showBtn = true), 1850)
		];

		return () => timers.forEach(clearTimeout);
	});
</script>

{#snippet box(label: string)}
	<pre class="btn" aria-hidden="true">{`╭${'─'.repeat(label.length + 2)}╮\n│ ${label} │\n╰${'─'.repeat(
			label.length + 2
		)}╯`}</pre>
{/snippet}

<svelte:head>
	<title>shipped! - anvil</title>
</svelte:head>

<div class="shipped">
	<ShippedFx />

	<div class="lines">
		{#if showTitle}
			<p class="title">
				<span class="accent">{data.project.title}</span>
				has been shipped!
			</p>
		{/if}
		{#if showBody}
			<p class="body">we're now reviewing it! we're gonna let you know when your sparks are gonna be ready to spend.</p>
		{/if}
		{#if showBtn}
			<a class="boxbtn" href={`/projects/${data.project.id}`}>
				{@render box('▸ back to the project')}
			</a>
		{/if}
	</div>
</div>

<style>
	/* TUI rule: one font size everywhere; the fx field sits above the copy,
	   the whole moment centered in the viewport */
	.shipped {
		min-height: calc(100svh - 12rem);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		font-size: var(--fs-md);

		:global(.fx) {
			width: 100%;
		}
	}

	.lines {
		min-height: 12rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		text-align: center;
		padding-inline: 2ch;
	}

	.title,
	.body,
	.boxbtn {
		animation: rise 0.35s ease-out both;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(0.6rem);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.title,
		.body,
		.boxbtn {
			animation: none;
		}
	}

	.title {
		color: var(--text);
		font-weight: 700;
	}

	.accent {
		color: var(--accent);
	}

	.body {
		color: color-mix(in srgb, var(--text) 75%, var(--dim));
		max-width: 56ch;
		line-height: 1.7;
	}

	.btn {
		margin: 0;
		font-family: var(--font-mono);
		font-size: inherit;
		line-height: 1.25;
		white-space: pre;
		user-select: none;
	}

	.boxbtn {
		color: var(--accent);

		&:hover .btn {
			background: var(--accent);
			color: var(--bg);
		}
	}
</style>
