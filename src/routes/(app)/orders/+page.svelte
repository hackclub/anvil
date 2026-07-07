<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import TuiConfirm from '$lib/ascii/TuiConfirm.svelte';
	import TuiSpinner from '$lib/ascii/TuiSpinner.svelte';
	import { Pending, withPending } from '$lib/pending.svelte';

	let { data, form } = $props();

	// relative, terminal-terse timestamps; past a month -> the plain date
	const fmtDate = (iso: string) => {
		const secs = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
		if (secs < 60) return 'just now';

		if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;

		if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;

		if (secs < 30 * 86400) return `${Math.floor(secs / 86400)}d ago`;

		return iso.slice(0, 10);
	};

	// cancel goes through the TUI confirm - yes submits the hidden form
	type Order = (typeof data.orders)[number];
	let pending = $state<Order | null>(null);
	let confirmOpen = $state(false);
	let cancelForm = $state<HTMLFormElement>();

	// cancel is optimistic: the row flips to cancelled the moment the user
	// confirms; if the server disagrees (e.g. fulfillment raced us) the
	// refreshed data restores it and form.error explains
	let cancellingId = $state<number | null>(null);
	const cancelling = new Pending();
	const statusOf = (o: Order) => (o.id === cancellingId ? 'cancelled' : o.status);

	// note saves: delayed spinner + brief "saved" flash
	let savingNoteId = $state<number | null>(null);
	let savedNoteId = $state<number | null>(null);
	const savingNote = new Pending();
</script>

<svelte:head>
	<title>orders - anvil</title>
</svelte:head>

<div class="orders">
	<h1>
		<span class="dim">$</span>
		anvil orders
	</h1>

	{#if form?.error}<p class="error">! {form.error}</p>{/if}
	{#if form?.cancelled}<p class="okay">order cancelled - your sparks are back!</p>{/if}

	{#if data.orders.length === 0}
		<p class="dim">
			nothing ordered yet - spend your sparks in the <a href="/shop">shop</a>
			.
		</p>
	{:else}
		<ul>
			{#each data.orders as o (o.id)}
				<li>
					<div class="row">
						{#if o.thumbnailUrl}
							<img class="thumb" src={o.thumbnailUrl} alt="" loading="lazy" />
						{:else}
							<span class="thumb nothumb dim">·</span>
						{/if}
						<span class="name">{o.itemName}</span>
						{#if o.quantity > 1}<span class="dim">×{o.quantity}</span>{/if}
						<span class="dim">
							<span class="spark">✶</span>
							{o.totalPrice}
						</span>
						<span class="status" data-status={statusOf(o)}>{statusOf(o)}</span>
						{#if cancelling.showing && o.id === cancellingId}
							<TuiSpinner label="cancelling" />
						{/if}
						<span class="dim date">{fmtDate(o.createdAt)}</span>
						{#if statusOf(o) === 'pending'}
							<button
								class="cancel"
								type="button"
								disabled={cancelling.active}
								onclick={() => {
									pending = o;
									confirmOpen = true;
								}}
							>
								[ × cancel ]
							</button>
						{/if}
					</div>
					{#if statusOf(o) === 'pending'}
						<!-- notes stay editable until fulfillment picks the order up -->
						<form
							method="POST"
							action="?/note"
							class="noteform"
							use:enhance={withPending(savingNote, () => {
								savingNoteId = o.id;
								return async ({ update }) => {
									await update({ reset: false });
									savingNoteId = null;
									savedNoteId = o.id;
									setTimeout(() => (savedNoteId = null), 1200);
								};
							})}
						>
							<input type="hidden" name="orderId" value={o.id} />
							<span class="dim">↳</span>
							<input
								name="notes"
								value={o.userNotes ?? ''}
								placeholder="notes for the team? (e.g. 'the red one please!')"
								maxlength="500"
							/>
							{#if savingNote.showing && savingNoteId === o.id}
								<TuiSpinner label="saving" />
							{:else if savedNoteId === o.id}
								<span class="okay">✓ saved</span>
							{:else}
								<button type="submit" disabled={savingNote.active}>[ save note ]</button>
							{/if}
						</form>
					{:else if o.userNotes}
						<p class="note">
							<span class="dim">↳</span>
							{o.userNotes}
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<!-- submitted only via the TUI confirm dialog's "yes" -->
<form
	bind:this={cancelForm}
	method="POST"
	action="?/cancel"
	hidden
	use:enhance={withPending(cancelling, () => async ({ update }) => {
		invalidateAll();
		await update();
		// server truth is in - drop the optimistic override either way
		cancellingId = null;
	})}
>
	<input type="hidden" name="orderId" value={pending?.id ?? ''} />
</form>

<TuiConfirm
	bind:open={confirmOpen}
	danger
	title="cancel order"
	message={pending
		? `cancel your order for "${pending.itemName}"? your ${pending.totalPrice} sparks come right back.`
		: ''}
	yesLabel="× yes, cancel it"
	noLabel="keep the order!"
	onyes={() => {
		cancellingId = pending?.id ?? null;
		cancelForm?.requestSubmit();
	}}
/>

<style>
	.orders {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 72ch;
	}

	h1 {
		font-size: var(--fs-lg);
		font-weight: 400;
	}

	a {
		color: var(--accent);
	}

	ul {
		list-style: none;
		display: flex;
		flex-direction: column;
	}

	li {
		padding: 0.8rem 0.5ch;
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 35%, transparent);
	}

	.row {
		display: flex;
		gap: 1.5ch;
		align-items: center;
	}

	.thumb {
		width: 2.6rem;
		height: 2.6rem;
		object-fit: cover;
		border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);
		flex-shrink: 0;
	}

	.nothumb {
		display: grid;
		place-items: center;
	}

	.name {
		font-weight: 700;
	}

	.status {
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);
		padding: 0 0.6ch;
		color: var(--dim);

		&[data-status='fulfilled'] {
			color: var(--accent);
			border-color: var(--accent);
		}
	}

	.date {
		margin-left: auto;
		font-size: var(--fs-xs);
	}

	.note {
		font-size: var(--fs-sm);
		margin-top: 0.4rem;
		opacity: 0.85;
	}

	.noteform {
		display: flex;
		gap: 1ch;
		align-items: center;
		margin-top: 0.5rem;
		font-size: var(--fs-sm);

		input {
			flex: 1;
			background: var(--bg-soft);
			border: 1px solid color-mix(in srgb, var(--dim) 50%, transparent);
			color: var(--text);
			font: inherit;
			padding: 0.25rem 1ch;
			caret-color: var(--accent);

			&:focus {
				outline: none;
				border-color: var(--accent);
			}
		}

		button {
			background: none;
			border: none;
			padding: 0;
			font: inherit;
			color: var(--dim);
			cursor: pointer;
			white-space: nowrap;

			&:hover:not(:disabled) {
				color: var(--accent);
			}

			&:disabled {
				cursor: wait;
			}
		}
	}

	.cancel {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: var(--fs-sm);
		color: var(--dim);
		cursor: pointer;

		&:hover:not(:disabled) {
			color: var(--accent);
		}

		&:disabled {
			cursor: wait;
		}
	}

	.okay {
		color: var(--accent);
	}

	.error {
		color: var(--accent);
	}

	.dim {
		color: var(--dim);
	}
</style>
