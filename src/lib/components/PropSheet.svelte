<script lang="ts">
	// Admin property sheet - regedit-style usability in the terminal skin:
	// name/type/value rows, double-click a value (or hit [ edit ]) to edit it
	// in place with a type-aware editor. Enter commits, Esc cancels; enums and
	// booleans commit on change. Commits POST to the host page's ?/setField
	// action and reload data. Fields without a spec render read-only.
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { FieldSpec } from '$lib/admin/editable';

	interface Props {
		/** entity kind - the key the server's setField validates against */
		kind: string;
		/** row id */
		id: string;
		data: Record<string, unknown>;
		editable: Record<string, FieldSpec>;
	}

	let { kind, id, data, editable }: Props = $props();

	let editing = $state<string | null>(null);
	let draft = $state('');
	let busy = $state(false);
	let err = $state<string | null>(null);
	let flash = $state<string | null>(null); // field that just saved

	const typeLabel = (f: string): string => {
		const spec = editable[f];
		if (!spec) return typeof data[f] === 'object' && data[f] !== null ? 'json' : 'ro';

		return spec.type + ('nullable' in spec && spec.nullable ? '?' : '');
	};

	const show = (v: unknown): string => {
		if (v === null || v === undefined) return '∅ null';

		if (typeof v === 'object') return JSON.stringify(v);

		return String(v);
	};

	function begin(field: string) {
		if (!editable[field] || busy) return;

		editing = field;
		err = null;
		const v = data[field];
		draft = v === null || v === undefined ? '' : String(v);
	}

	function cancel() {
		editing = null;
		err = null;
	}

	async function commit(field: string, value: string | null) {
		busy = true;
		err = null;
		try {
			const fd = new FormData();
			fd.set('kind', kind);
			fd.set('id', id);
			fd.set('field', field);
			if (value === null) {
				fd.set('null', '1');
			} else {
				fd.set('value', value);
			}

			const resp = await fetch('?/setField', {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});

			const result = deserialize(await resp.text());
			if (result.type === 'success') {
				editing = null;
				flash = field;
				setTimeout(() => (flash = null), 1200);
				await invalidateAll();
			} else if (result.type === 'failure') {
				err = String(result.data?.error ?? 'update failed');
			} else {
				err = 'update failed';
			}
		} catch {
			err = 'update failed - network?';
		} finally {
			busy = false;
		}
	}

	function onKeydown(e: KeyboardEvent, field: string) {
		if (e.key === 'Enter' && !(e.currentTarget instanceof HTMLTextAreaElement && e.shiftKey)) {
			e.preventDefault();
			commit(field, draft);
		} else if (e.key === 'Escape') {
			cancel();
		}
	}
</script>

<div class="sheet">
	{#each Object.keys(data) as field (field)}
		{@const spec = editable[field]}
		<!-- double-click is a convenience; the [ edit ] button is the accessible path -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="prow"
			class:editable={!!spec}
			class:active={editing === field}
			class:flash={flash === field}
			ondblclick={() => begin(field)}
		>
			<span class="name">{field}</span>
			<span class="type">{typeLabel(field)}</span>
			{#if editing === field && spec}
				<span class="value">
					{#if spec.type === 'boolean'}
						<select
							class="ed"
							value={String(data[field] ?? 'false')}
							disabled={busy}
							onchange={(e) => commit(field, e.currentTarget.value)}
							onkeydown={(e) => e.key === 'Escape' && cancel()}
						>
							<option value="true">true</option>
							<option value="false">false</option>
						</select>
					{:else if spec.type === 'enum'}
						<select
							class="ed"
							value={String(data[field] ?? spec.options[0])}
							disabled={busy}
							onchange={(e) => commit(field, e.currentTarget.value)}
							onkeydown={(e) => e.key === 'Escape' && cancel()}
						>
							{#each spec.options as o (o)}
								<option value={o}>{o}</option>
							{/each}
						</select>
					{:else if spec.type === 'string' && spec.multiline}
						<!-- svelte-ignore a11y_autofocus -->
						<textarea
							class="ed"
							rows="3"
							bind:value={draft}
							disabled={busy}
							autofocus
							onkeydown={(e) => onKeydown(e, field)}></textarea>
					{:else}
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="ed"
							bind:value={draft}
							disabled={busy}
							autofocus
							spellcheck="false"
							autocomplete="off"
							onkeydown={(e) => onKeydown(e, field)}
						/>
					{/if}
					<span class="edbtns">
						{#if spec.type !== 'boolean' && spec.type !== 'enum'}
							<button type="button" disabled={busy} onclick={() => commit(field, draft)}>[ save ]</button>
						{/if}
						{#if 'nullable' in spec && spec.nullable}
							<button type="button" disabled={busy} onclick={() => commit(field, null)}>[ set null ]</button>
						{/if}
						<button type="button" disabled={busy} onclick={cancel}>[ esc ]</button>
					</span>
					{#if err}<span class="err">! {err}</span>{/if}
				</span>
			{:else}
				<span class="value" class:nul={data[field] == null}>
					{show(data[field])}
					{#if spec}
						<button class="editbtn" type="button" onclick={() => begin(field)}>[ edit ]</button>
					{/if}
				</span>
			{/if}
		</div>
	{/each}
</div>

<style>
	.sheet {
		display: flex;
		flex-direction: column;
	}

	.prow {
		display: grid;
		grid-template-columns: 22ch 9ch 1fr;
		gap: 0 2ch;
		padding: 0.2rem 1ch;
		align-items: baseline;
		border-left: 2px solid transparent;

		&:nth-child(odd) {
			background: color-mix(in srgb, var(--bg-soft) 55%, transparent);
		}

		&.editable:hover {
			background: var(--bg-soft);

			.editbtn {
				visibility: visible;
			}
		}

		&.active {
			border-left-color: var(--accent);
			background: var(--bg-soft);
		}

		&.flash {
			border-left-color: var(--accent);
		}
	}

	.name {
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.type {
		color: var(--dim);
	}

	.value {
		color: color-mix(in srgb, var(--text) 70%, var(--dim));
		word-break: break-all;
		display: flex;
		gap: 1ch;
		align-items: baseline;
		flex-wrap: wrap;

		&.nul {
			color: var(--dim);
		}
	}

	/* the [ edit ] affordance only surfaces on row hover - quiet otherwise */
	.editbtn {
		visibility: hidden;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		color: var(--dim);
		cursor: pointer;

		&:hover {
			color: var(--accent);
		}
	}

	.ed {
		flex: 1;
		min-width: 16ch;
		background: var(--bg);
		border: 1px solid var(--accent);
		color: var(--text);
		font: inherit;
		padding: 0.1rem 0.5ch;
		caret-color: var(--accent);

		&:focus {
			outline: none;
		}
	}

	textarea.ed {
		resize: vertical;
		width: 100%;
	}

	.edbtns {
		display: flex;
		gap: 1ch;

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
		}
	}

	.err {
		color: var(--accent);
	}
</style>
