<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import TuiConfirm from '$lib/ascii/TuiConfirm.svelte';

	let { data, form } = $props();

	type Item = (typeof data.items)[number];

	let category = $state<string>('all');
	let sort = $state<'featured' | 'price-asc' | 'price-desc' | 'name'>('featured');

	// confirm-before-order: the modal's yes submits the hidden form
	let pending = $state<Item | null>(null);
	let confirmOpen = $state(false);
	let orderNote = $state('');
	let buyForm = $state<HTMLFormElement>();

	const categories = $derived(['all', ...new Set(data.items.map((i) => i.category ?? 'other'))]);

	const shown = $derived.by(() => {
		const filtered = data.items.filter((i) => category === 'all' || (i.category ?? 'other') === category);

		const by = {
			featured: (a: Item, b: Item) => a.sortOrder - b.sortOrder,
			'price-asc': (a: Item, b: Item) => a.price - b.price,
			'price-desc': (a: Item, b: Item) => b.price - a.price,
			name: (a: Item, b: Item) => a.name.localeCompare(b.name)
		}[sort];

		return [...filtered].sort(by);
	});

	function askToOrder(item: Item) {
		pending = item;
		orderNote = '';
		confirmOpen = true;
	}
</script>

<svelte:head>
	<title>shop - anvil</title>
</svelte:head>

<div class="shop">
	{#if data.balance === 0}
		<p class="nospark">
			{#if data.hasPendingShip}
				<span class="dim">!</span>
				your
				<span class="accent">✶ sparks</span>
				are on the way - a ship of yours is in review. hang tight!
			{:else}
				<span class="dim">!</span>
				no
				<span class="accent">✶ sparks</span>
				yet - ship a project first! sparks come from approved hours.
			{/if}
		</p>
	{/if}

	{#if form?.ordered}
		<p class="okay">
			order placed! track it in <a href="/orders">orders</a>
			.
		</p>
	{/if}

	<div class="controls">
		<div class="chips">
			{#each categories as c (c)}
				<button class="chip" class:active={category === c} onclick={() => (category = c)}>
					[ {c} ]
				</button>
			{/each}
		</div>
		<label class="sortctl">
			<span class="dim">sort:</span>
			<select bind:value={sort}>
				<option value="featured">featured</option>
				<option value="price-asc">price ↑</option>
				<option value="price-desc">price ↓</option>
				<option value="name">name a→z</option>
			</select>
		</label>
	</div>

	<ul class="grid">
		{#each shown as item (item.id)}
			<li class="card">
				{#if item.thumbnailUrl}
					<img src={item.thumbnailUrl} alt={item.name} loading="lazy" />
				{:else}
					<div class="noimg dim">·</div>
				{/if}
				<div class="info">
					<h2>{item.name}</h2>
					<p class="desc">{item.description}</p>
					<div class="meta">
						<span class="price">
							<span class="spark">✶</span>
							{item.price}
						</span>
						{#if item.onePerUser}<span class="dim">1/person</span>{/if}
						{#if item.stock != null}<span class="dim">{item.stock} left</span>{/if}
					</div>
					{#if form?.error && form?.itemId === item.id}
						<p class="error">! {form.error}</p>
					{/if}
					<button class="order" type="button" disabled={data.balance < item.price} onclick={() => askToOrder(item)}>
						{data.balance >= item.price ? '[ ▸ order ]' : '[ not enough sparks ]'}
					</button>
				</div>
			</li>
		{/each}
	</ul>
</div>

<!-- ALL orders go through the TUI confirm - yes submits this form -->
<form
	bind:this={buyForm}
	method="POST"
	action="?/purchase"
	hidden
	use:enhance={() =>
		({ update }) => {
			invalidateAll();
			return update();
		}}
>
	<input type="hidden" name="itemId" value={pending?.id ?? ''} />
	<input type="hidden" name="quantity" value="1" />
	<input type="hidden" name="notes" value={orderNote} />
</form>

<TuiConfirm
	bind:open={confirmOpen}
	title="confirm order"
	face="[ owo ]"
	message={pending
		? `order "${pending.name}" for ${pending.price} sparks? our fulfillment team takes it from here - you can track it on the orders page!`
		: ''}
	input="notes for the team? (e.g. 'the red one please!')"
	bind:inputValue={orderNote}
	yesLabel="✶ yes, order it!"
	noLabel="not yet!"
	onyes={() => buyForm?.requestSubmit()}
/>

<style>
	.shop {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.nospark {
		border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
		padding: 0.75rem 2ch;
		line-height: 1.7;
	}

	.accent {
		color: var(--accent);
	}

	.controls {
		display: flex;
		align-items: baseline;
		gap: 2rem;
		flex-wrap: wrap;
	}

	.chips {
		display: flex;
		gap: 1ch;
		flex-wrap: wrap;
	}

	.chip {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: var(--fs-sm);
		color: var(--dim);
		cursor: pointer;

		&:hover {
			color: var(--text);
		}

		&.active {
			color: var(--bg);
			background: var(--accent);
		}
	}

	.sortctl {
		margin-left: auto;
		display: flex;
		gap: 1ch;
		align-items: baseline;
		font-size: var(--fs-sm);

		select {
			background: var(--bg-soft);
			border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);
			color: var(--text);
			font: inherit;
			font-size: var(--fs-sm);
			padding: 0.2rem 0.5ch;
		}
	}

	/* image first, then name/description - a proper card grid */
	.grid {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(26ch, 1fr));
		gap: 1.5rem;
	}

	.card {
		display: flex;
		flex-direction: column;
		border: 1px solid color-mix(in srgb, var(--dim) 40%, transparent);

		&:hover {
			border-color: color-mix(in srgb, var(--dim) 80%, transparent);
		}
	}

	.card img,
	.noimg {
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 40%, transparent);
		background: var(--bg-soft);
	}

	.noimg {
		display: grid;
		place-items: center;
	}

	.info {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.9rem 1.25ch 1.1rem;
		flex: 1;
	}

	h2 {
		font-size: var(--fs-md);
		font-weight: 700;
	}

	.desc {
		font-size: var(--fs-sm);
		opacity: 0.85;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		flex: 1;
	}

	.meta {
		display: flex;
		gap: 2ch;
		font-size: var(--fs-sm);
		align-items: baseline;
	}

	.price {
		color: var(--accent);
		font-weight: 700;
	}

	.order {
		align-self: flex-start;
		background: none;
		border: 1px solid var(--accent);
		color: var(--accent);
		font: inherit;
		font-size: var(--fs-sm);
		padding: 0.3rem 1ch;
		cursor: pointer;

		&:hover:not(:disabled) {
			background: var(--accent);
			color: var(--bg);
		}

		&:disabled {
			border-color: var(--dim);
			color: var(--dim);
			cursor: not-allowed;
		}
	}

	.okay {
		color: var(--accent);

		a {
			color: var(--accent);
			text-decoration: underline;
		}
	}

	.error {
		color: var(--accent);
		font-size: var(--fs-sm);
	}

	.dim {
		color: var(--dim);
	}
</style>
