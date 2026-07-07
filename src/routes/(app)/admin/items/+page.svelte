<script lang="ts">
	import { enhance } from '$app/forms';
	import TuiConfirm from '$lib/ascii/TuiConfirm.svelte';
	import { Pending, withPending } from '$lib/pending.svelte';
	import TuiSpinner from '$lib/ascii/TuiSpinner.svelte';

	let { data, form } = $props();
	let editing = $state<string | 'new' | null>(null);
	let confirmDelete = $state(false);
	let deleteForm = $state<HTMLFormElement>();

	const saving = new Pending();
	const removing = new Pending();

	const blank = {
		id: '',
		name: '',
		description: '',
		category: '',
		fulfillerContext: '',
		price: 0,
		usdCost: null as number | null,
		stock: null as number | null,
		onePerUser: false,
		visible: true,
		sortOrder: 0
	};

	const target = $derived(editing === 'new' ? blank : (data.items.find((i) => i.id === editing) ?? blank));
</script>

<svelte:head>
	<title>admin/items - anvil</title>
</svelte:head>

<div class="items">
	{#if form?.error}
		<p class="error">! {form.error}</p>
	{/if}

	<table>
		<thead>
			<tr>
				<th>item</th>
				<th>
					<span class="spark">✶</span>
					price
				</th>
				<th>$ cost</th>
				<th>stock</th>
				<th>flags</th>
				<th></th>
			</tr>
		</thead>

		<tbody>
			{#each data.items as i (i.id)}
				<tr class:hidden-item={!i.visible}>
					<td>
						<span class="itemcell">
							{#if i.thumbnailUrl}
								<img class="thumb" src={i.thumbnailUrl} alt="" loading="lazy" />
							{:else}
								<span class="thumb placeholder">·</span>
							{/if}
							{i.name}
						</span>
					</td>

					<td>{i.price}</td>
					<td class="dim">{i.usdCost ?? '-'}</td>
					<td class="dim">{i.stock ?? '∞'}</td>
					<td class="dim">{i.onePerUser ? '1/user ' : ''}{!i.visible ? 'hidden' : ''}</td>

					<td>
						<button class="ghost" onclick={() => (editing = i.id)}>[ edit ]</button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<button class="ghost" onclick={() => (editing = editing === 'new' ? null : 'new')}>[ + new item ]</button>

	{#if editing}
		<!-- background click intentionally does not close this - escape or the [x] button does -->
		<div class="backdrop">
			<div
				class="panel"
				role="dialog"
				aria-modal="true"
				aria-label={editing === 'new' ? 'new item' : `edit ${target.name}`}
				tabindex="-1"
			>
				<div class="paneltop">
					<span class="dim">$</span>
					{editing === 'new' ? 'new item' : `edit - ${target.name}`}
					<button class="ghost close" type="button" onclick={() => (editing = null)}>[ × ]</button>
				</div>

				<form
					method="POST"
					action="?/save"
					enctype="multipart/form-data"
					class="editor"
					use:enhance={withPending(saving, () => ({ update }) => {
						editing = null;
						return update();
					})}
				>
					<input type="hidden" name="id" value={target.id} />
					<label>
						<span>name</span>
						<input name="name" value={target.name} required />
					</label>

					<label>
						<span>category (shop filter chip)</span>
						<input name="category" value={target.category} />
					</label>

					<label>
						<span>description (user-facing)</span>
						<textarea name="description" rows="2">{target.description}</textarea>
					</label>

					<label>
						<span>fulfiller context (staff-facing)</span>
						<textarea name="fulfillerContext" rows="2">{target.fulfillerContext}</textarea>
					</label>

					<div class="row">
						<label>
							<span>
								<span class="spark">✶</span>
								price
							</span>
							<input name="price" type="number" step="0.01" value={target.price} required />
						</label>

						<label>
							<span>$ cost</span>
							<input name="usdCost" type="number" step="0.01" value={target.usdCost ?? ''} />
						</label>

						<label>
							<span>stock (empty = ∞)</span>
							<input name="stock" type="number" value={target.stock ?? ''} />
						</label>
						<label>
							<span>sort</span>
							<input name="sortOrder" type="number" value={target.sortOrder} />
						</label>
					</div>
					<div class="row">
						<label class="check">
							<input name="onePerUser" type="checkbox" checked={target.onePerUser} />
							one per user
						</label>
						<label class="check">
							<input name="visible" type="checkbox" checked={target.visible} />
							visible
						</label>
						<label>
							<span>thumbnail</span>
							<input name="thumbnail" type="file" accept="image/*" />
						</label>
					</div>
					<div class="row actions">
						<button type="submit" disabled={saving.active}>
							{#if saving.showing}<TuiSpinner label="saving" />{:else}[ save item ]{/if}
						</button>
						{#if target.id}
							<button type="button" class="danger" disabled={removing.active} onclick={() => (confirmDelete = true)}>
								{#if removing.showing}<TuiSpinner label="removing" />{:else}[ × delete item ]{/if}
							</button>
						{/if}
					</div>
				</form>
			</div>
		</div>
	{/if}
</div>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && editing && !confirmDelete) {
			editing = null;
		}
	}}
/>

<!-- submitted only via the TUI confirm dialog's "yes" -->
<form
	bind:this={deleteForm}
	method="POST"
	action="?/remove"
	hidden
	use:enhance={withPending(removing, () => ({ update }) => {
		editing = null;
		return update();
	})}
>
	<input type="hidden" name="id" value={target.id} />
</form>

<TuiConfirm
	bind:open={confirmDelete}
	title="delete item"
	message={`delete "${target.name}" from the shop? existing orders keep their history, but nobody can order it anymore.`}
	yesLabel="× yes, delete it"
	noLabel="no, keep it!"
	onyes={() => deleteForm?.requestSubmit()}
/>

<style>
	.items {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		font-size: var(--fs-sm);
	}

	table {
		border-collapse: collapse;
		width: 100%;
	}

	th {
		text-align: left;
		color: var(--dim);
		font-weight: 400;
		padding: 0.3rem 1ch;
		border-bottom: 1px solid var(--dim);
	}

	td {
		padding: 0.45rem 1ch;
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 25%, transparent);
	}

	tr.hidden-item td {
		opacity: 0.5;
	}

	.itemcell {
		display: flex;
		align-items: center;
		gap: 1.5ch;
	}

	.thumb {
		width: 2.2rem;
		height: 2.2rem;
		object-fit: cover;
		border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);

		&.placeholder {
			display: grid;
			place-items: center;
			color: var(--dim);
		}
	}

	button {
		background: none;
		border: 1px solid var(--dim);
		color: var(--dim);
		font: inherit;
		font-size: var(--fs-sm);
		padding: 0.25rem 1ch;
		cursor: pointer;

		&:hover:not(:disabled) {
			color: var(--text);
			border-color: var(--text);
		}

		&.ghost {
			border: none;
			padding: 0;
		}

		&.danger:hover:not(:disabled) {
			color: var(--accent);
		}

		&:disabled {
			color: color-mix(in srgb, var(--dim) 55%, transparent);
			border-color: color-mix(in srgb, var(--dim) 40%, transparent);
			cursor: wait;
		}
	}

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;

		/* below the TuiConfirm (z-90) */
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		backdrop-filter: blur(2px);
		display: grid;
		place-items: center;
		padding: 2rem;
	}

	.panel {
		background: var(--bg);
		border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);
		width: min(72ch, 100%);
		max-height: 90vh;
		overflow-y: auto;
	}

	.paneltop {
		display: flex;
		gap: 1ch;
		align-items: baseline;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 40%, transparent);
		color: var(--text);

		.close {
			margin-left: auto;
		}
	}

	.editor {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		padding: 1.25rem;
	}

	.actions {
		justify-content: space-between;

		.danger {
			border-color: var(--dim);
			color: var(--dim);

			&:hover:not(:disabled) {
				border-color: var(--accent);
				color: var(--accent);
			}
		}
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;

		span {
			color: var(--dim);
			font-size: var(--fs-xs);
		}

		&.check {
			flex-direction: row;
			align-items: center;
			gap: 1ch;
		}
	}

	input,
	textarea {
		background: var(--bg-soft);
		border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);
		color: var(--text);
		font: inherit;
		font-size: var(--fs-sm);
		padding: 0.35rem 1ch;
	}

	.row {
		display: flex;
		gap: 2ch;
		flex-wrap: wrap;
	}

	.error {
		color: var(--accent);
	}

	.dim {
		color: var(--dim);
	}
</style>
