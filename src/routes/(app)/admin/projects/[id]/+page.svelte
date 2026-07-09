<script lang="ts">
	import { enhance } from '$app/forms';
	import PropSheet from '$lib/components/PropSheet.svelte';
	import { EDITABLE } from '$lib/admin/editable';
	import { Pending, withPending } from '$lib/pending.svelte';
	import TuiSpinner from '$lib/ascii/TuiSpinner.svelte';

	let { data, form } = $props();

	const settingLevel = new Pending();
	const unflagging = new Pending();
	const unlocking = new Pending();
	const linking = new Pending();
	// per-row actions share one tracker + a marker for which row is in flight
	const verifying = new Pending();
	let verifyingId = $state<unknown>(null);
	const unlinking = new Pending();
	let unlinkingId = $state<unknown>(null);

	const project = $derived(data.entities.project as Record<string, unknown>);
	const sources = $derived(data.entities.tractionSources as Record<string, unknown>[]);

	// (section title, entity kind, rows) - arrays get one sheet per row
	const sections = $derived([
		{ name: 'project', kind: 'project', rows: [data.entities.project] },
		{ name: 'ships', kind: 'ship', rows: data.entities.ships },
		{ name: 'reviews', kind: 'review', rows: data.entities.reviews },
		{ name: 'traction sources', kind: 'tractionSource', rows: data.entities.tractionSources },
		{ name: 'ledger', kind: 'ledger', rows: data.entities.ledger }
	] as { name: string; kind: string; rows: Record<string, unknown>[] }[]);

	const rowTitle = (kind: string, row: Record<string, unknown>): string => {
		if (kind === 'ship') return `ship #${row.shipNumber}`;

		if (kind === 'review') return `${row.kind} by ${row.reviewerActorId}`;

		if (kind === 'tractionSource') return `${row.kind}: ${row.externalRef}`;

		if (kind === 'ledger') return `${row.kind} ${row.amount}`;

		return String(row.id);
	};
</script>

<svelte:head>
	<title>inspect - anvil admin</title>
</svelte:head>

<div class="inspect">
	<h1>
		<a class="dim" href="/admin/projects">projects/</a>
		{project.title}
	</h1>

	<p class="owner">
		<span class="dim">owner:</span>
		<a href={`/admin/users?q=${encodeURIComponent(data.owner.email)}`}>
			{data.owner.username ? `@${data.owner.username}` : data.owner.email} →
		</a>
	</p>

	<div class="actions">
		{#if form?.error}<span class="error">! {form.error}</span>{/if}
		<form method="POST" action="?/setMaxLevel" use:enhance={withPending(settingLevel)}>
			<label class="dim" for="level">max reviewed level</label>
			<select name="level" id="level">
				{#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as l (l)}
					<option value={l} selected={l === project.maxReviewedLevel}>LVL {l}</option>
				{/each}
			</select>
			<button type="submit" disabled={settingLevel.active}>
				{#if settingLevel.showing}<TuiSpinner label="recomputing" />{:else}[ apply + recompute ]{/if}
			</button>
		</form>
		{#if project.scoreFlagged}
			<form method="POST" action="?/unflag" use:enhance={withPending(unflagging)}>
				<button type="submit" disabled={unflagging.active}>
					{#if unflagging.showing}<TuiSpinner label="clearing" />{:else}[ clear velocity flag ]{/if}
				</button>
			</form>
		{/if}
		{#if project.locked}
			<form method="POST" action="?/unlock" use:enhance={withPending(unlocking)}>
				<button type="submit" disabled={unlocking.active}>
					{#if unlocking.showing}<TuiSpinner label="unlocking" />{:else}[ unlock (undo hard-reject) ]{/if}
				</button>
			</form>
		{/if}
		{#each sources.filter((s) => !s.verified) as s (s.id)}
			<form
				method="POST"
				action="?/verifySource"
				use:enhance={withPending(verifying, () => {
					verifyingId = s.id;
					return ({ update }) => update();
				})}
			>
				<input type="hidden" name="sourceId" value={s.id} />
				<button type="submit" disabled={verifying.active}>
					{#if verifying.showing && verifyingId === s.id}
						<TuiSpinner label="verifying" />
					{:else}
						[ verify {s.kind}:{s.externalRef} ]
					{/if}
				</button>
			</form>
		{/each}
	</div>

	<p class="hint">
		double-click a value (or hover for [ edit ]) to change it in place - enter saves, esc cancels. raw edits skip
		recomputes; dim fields are read-only.
	</p>

	<details open>
		<summary>
			<span class="dim">$</span>
			hackatime links
		</summary>
		<div class="body links">
			{#if data.hackatimeLinks.length === 0}
				<p class="dim empty">- no keys linked -</p>
			{:else}
				<ul>
					{#each data.hackatimeLinks as l (l.id)}
						<li>
							<span>{l.hackatimeKey}</span>
							<form
								method="POST"
								action="?/unlinkKey"
								use:enhance={withPending(unlinking, () => {
									unlinkingId = l.id;
									return ({ update }) => update();
								})}
							>
								<input type="hidden" name="linkId" value={l.id} />
								<button type="submit" class="danger" disabled={unlinking.active}>
									{#if unlinking.showing && unlinkingId === l.id}
										<TuiSpinner label="unlinking" />
									{:else}
										[ unlink ]
									{/if}
								</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
			<form method="POST" action="?/linkKey" class="addkey" use:enhance={withPending(linking)}>
				<input name="key" placeholder="hackatime key to link (on the user's behalf)" required />
				<button type="submit" disabled={linking.active}>
					{#if linking.showing}<TuiSpinner label="linking" />{:else}[ + link ]{/if}
				</button>
			</form>
		</div>
	</details>

	{#each sections as sec (sec.name)}
		<details open={sec.kind === 'project'}>
			<summary>
				<span class="dim">$</span>
				edit {sec.name}
				{#if sec.rows.length !== 1}<span class="dim">({sec.rows.length})</span>{/if}
			</summary>
			<div class="body">
				{#if sec.rows.length === 0}
					<p class="dim empty">- none -</p>
				{:else}
					{#each sec.rows as row (row.id)}
						{#if sec.rows.length > 1 || (sec.kind !== 'project' && sec.kind !== 'owner')}
							<p class="rowtitle">{rowTitle(sec.kind, row)}</p>
						{/if}
						<PropSheet kind={sec.kind} id={String(row.id)} data={row} editable={EDITABLE[sec.kind] ?? {}} />
					{/each}
				{/if}
			</div>
		</details>
	{/each}

	<details>
		<summary>
			<span class="dim">$</span>
			cat raw.json
		</summary>
		<pre>{JSON.stringify(data.entities, null, 2)}</pre>
	</details>
</div>

<style>
	.inspect {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		font-size: var(--fs-sm);
	}

	h1 {
		font-size: var(--fs-lg);
		font-weight: 400;

		a:hover {
			color: var(--text);
		}
	}

	.actions {
		display: flex;
		gap: 1.5ch;
		flex-wrap: wrap;
		align-items: center;

		form {
			display: flex;
			gap: 1ch;
			align-items: center;
		}
	}

	select {
		background: var(--bg-soft);
		border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);
		color: var(--text);
		font: inherit;
		font-size: var(--fs-sm);
		padding: 0.2rem 0.5ch;
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
			color: var(--accent);
			border-color: var(--accent);
		}

		&:disabled {
			color: color-mix(in srgb, var(--dim) 55%, transparent);
			border-color: color-mix(in srgb, var(--dim) 40%, transparent);
			cursor: wait;
		}
	}

	.hint {
		color: var(--dim);
	}

	.owner a {
		color: var(--accent);
	}

	.links {
		padding: 0.5rem 1ch;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;

		ul {
			list-style: none;
			padding: 0;
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
		}

		li {
			display: flex;
			gap: 2ch;
			align-items: center;
		}

		.danger:hover:not(:disabled) {
			color: var(--accent);
			border-color: var(--accent);
		}
	}

	.addkey {
		display: flex;
		gap: 1ch;

		input {
			background: var(--bg-soft);
			border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);
			color: var(--text);
			font: inherit;
			font-size: var(--fs-sm);
			padding: 0.25rem 1ch;
			width: 44ch;
		}
	}

	details {
		border: 1px solid color-mix(in srgb, var(--dim) 40%, transparent);
	}

	summary {
		cursor: pointer;
		padding: 0.5rem 1ch;
		list-style: none;

		&:hover {
			color: var(--accent);
		}
	}

	.body {
		border-top: 1px solid color-mix(in srgb, var(--dim) 40%, transparent);
		padding: 0.5rem 0;
		max-height: 40rem;
		overflow-y: auto;
	}

	.rowtitle {
		padding: 0.5rem 1ch 0.2rem;
		color: var(--accent);
	}

	.empty {
		padding: 0.25rem 1ch;
	}

	pre {
		padding: 0.75rem 1ch;
		overflow-x: auto;
		font-size: var(--fs-xs);
		line-height: 1.5;
		border-top: 1px solid color-mix(in srgb, var(--dim) 40%, transparent);
		max-height: 32rem;
		overflow-y: auto;
	}

	.error {
		color: var(--accent);
	}

	.dim {
		color: var(--dim);
	}

	/* phones: the 44ch key input can't keep its fixed width */
	@media (max-width: 560px) {
		.addkey {
			flex-wrap: wrap;

			input {
				width: 100%;
			}
		}
	}
</style>
