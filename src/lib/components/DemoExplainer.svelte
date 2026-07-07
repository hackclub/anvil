<script lang="ts">
	let { open = $bindable(false) } = $props();
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={() => (open = false)}>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-label="what should my demo be?"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<p class="title">
				<span class="dim">┤</span>
				what should my demo be?
				<span class="dim">├</span>
			</p>
			<p>the demo link should be an easy way for others to experience your project. here's a cheatlist!</p>
			<ul>
				<li>
					<span class="accent">websites:</span>
					always a link to a live, deployed version of your site
				</li>
				<li>
					<span class="accent">desktop apps:</span>
					a link to a GitHub Release or equivalent
				</li>
				<li>
					<span class="accent">Python projects:</span>
					a link to https://pypi.org
				</li>
				<li>
					<span class="accent">Rust projects:</span>
					a link to https://crates.io
				</li>
				<li>
					<span class="accent">Node.js projects:</span>
					a link to https://npmjs.com
				</li>
			</ul>
			<p>you get the gist!</p>
			<button type="button" onclick={() => (open = false)}>[ × close ]</button>
		</div>
	</div>
{/if}

<style>
	/* TUI rule: one font size everywhere */
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: color-mix(in srgb, var(--bg) 75%, transparent);
		display: grid;
		place-items: center;
		padding: 1rem;
	}

	.modal {
		max-width: 72ch;
		background: var(--bg);
		border: 1px solid var(--accent);
		padding: 1.5rem 2ch;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		font-size: var(--fs-md);
	}

	.title {
		font-weight: 700;
		color: var(--accent);
	}

	p {
		line-height: 1.7;
	}

	ul {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	li::before {
		content: '- ';
		color: var(--dim);
	}

	button {
		align-self: flex-start;
		background: none;
		border: 1px solid var(--dim);
		color: var(--dim);
		font: inherit;
		padding: 0.3rem 1ch;
		cursor: pointer;

		&:hover {
			color: var(--accent);
			border-color: var(--accent);
		}
	}

	.accent {
		color: var(--accent);
	}

	.dim {
		color: var(--dim);
	}
</style>
