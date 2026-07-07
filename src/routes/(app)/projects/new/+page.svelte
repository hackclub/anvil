<script lang="ts">
	// The title prompt and the create button are drawn with box-drawing
	// characters (same style as the hackatime search box) - the DOM input
	// overlays the middle row of its drawn box. Mono grid: positions in ch,
	// rows are 1.25em tall like every other TUI here.
	import { enhance } from '$app/forms';

	let { form } = $props();

	let focused = $state(false);
	let creating = $state(false);

	const W = 48; // prompt box width in cells
	const BTN = '▸ create';
</script>

<svelte:head>
	<title>new project - anvil</title>
</svelte:head>

<div class="newproj">
	<p>
		<span class="dim">$</span>
		anvil new
	</p>

	<form
		method="POST"
		action="?/create"
		use:enhance={() => {
			creating = true;
			return async ({ update }) => {
				creating = false;
				await update();
			};
		}}
	>
		{#if form?.error}
			<p class="error">! {form.error}</p>
		{/if}

		<p>what's your project called?</p>

		<div class="tuibox" class:focused>
			<pre aria-hidden="true">{`╭${'─'.repeat(W - 2)}╮\n│ `}<span
					class="accent">&gt;</span>{`${' '.repeat(W - 4)}│\n╰${'─'.repeat(W - 2)}╯`}</pre>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				name="title"
				required
				maxlength="80"
				placeholder="my-cool-tool"
				autocomplete="off"
				spellcheck="false"
				autofocus
				onfocus={() => (focused = true)}
				onblur={() => (focused = false)}
			/>
		</div>

		<button type="submit" class="boxbtn" disabled={creating}>
			<pre>{`╭${'─'.repeat(BTN.length + 2)}╮\n│ ${creating ? 'creating' : BTN} │\n╰${'─'.repeat(
					BTN.length + 2
				)}╯`}</pre>
		</button>

		<p class="dim">don't worry - you can always change it later.</p>
	</form>
</div>

<style>
	/* TUI rule: one font size everywhere */
	.newproj {
		max-width: 64ch;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		font-size: var(--fs-md);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: inherit;
		line-height: 1.25;
		white-space: pre;
		user-select: none;

		/* the drawn chrome is decoration - the input is the content */
	}

	/* the drawn prompt box - the input types into its middle row */
	.tuibox {
		position: relative;
		width: fit-content;
		color: var(--dim);

		&.focused {
			color: var(--accent);
		}

		.accent {
			color: var(--accent);
		}

		input {
			position: absolute;
			left: 4ch;
			top: 1.25em;
			height: 1.25em;
			width: 42ch;
			background: none;
			border: none;
			padding: 0;
			margin: 0;
			color: var(--text);
			font: inherit;
			line-height: 1.25;
			caret-color: var(--accent);

			&:focus {
				outline: none;
			}

			&::placeholder {
				color: color-mix(in srgb, var(--dim) 70%, transparent);
			}
		}
	}

	/* box-drawing create button, same look as the TUI button bands */
	.boxbtn {
		align-self: flex-start;
		background: none;
		border: none;
		padding: 0;
		color: var(--accent);
		font: inherit;
		cursor: pointer;

		&:hover:not(:disabled) pre {
			background: var(--accent);
			color: var(--bg);
		}

		&:disabled {
			color: var(--dim);
			cursor: wait;
		}
	}

	.error {
		color: var(--accent);
	}

	.dim {
		color: var(--dim);
	}
</style>
