<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label?: string;
		href?: string;
		variant?: 'primary' | 'ghost';
		onclick?: (e: MouseEvent) => void;
		children?: Snippet;
	}

	let { label, href, variant = 'ghost', onclick, children }: Props = $props();
</script>

{#if href}
	<a class="btn {variant}" {href} {onclick}>
		{#if children}{@render children()}{:else}[ {label} ]{/if}
	</a>
{:else}
	<button class="btn {variant}" {onclick}>
		{#if children}{@render children()}{:else}[ {label} ]{/if}
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 1rem;
		line-height: 1.4;
		color: var(--accent);
		background: transparent;
		border: 0;
		padding: 0.15em 0.3em;
		cursor: pointer;
		text-decoration: none;
		transition:
			color 0.08s ease,
			background-color 0.08s ease;
		outline: none;

		&.primary {
			font-weight: 700;
		}

		/* terminal-style full inversion on hover/focus */
		&:hover,
		&:focus-visible {
			color: var(--bg);
			background: var(--accent);
		}

		/* blinking block cursor trailing the focused/hovered control */
		&:hover::after,
		&:focus-visible::after {
			content: '\2588';
			margin-left: 0.25em;
			animation: blink 1s steps(1) infinite;
		}
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
</style>
