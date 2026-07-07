<script lang="ts">
	import { cfg, resetConfig, type FieldConfig } from '$lib/ascii/config.svelte';

	let open = $state(false);

	type NumKey = Exclude<keyof FieldConfig, 'glitch'>;
	const sliders: { key: NumKey; label: string; min: number; max: number; step: number }[] = [
		{ key: 'cell', label: 'grid size', min: 8, max: 28, step: 1 },
		{ key: 'density', label: 'field density', min: 0, max: 1, step: 0.05 },
		{ key: 'spread', label: 'ball size', min: 0.2, max: 5, step: 0.1 },
		{ key: 'cluster', label: 'smoke / step', min: 1, max: 6, step: 1 },
		{ key: 'sparkChance', label: 'sparks', min: 0, max: 0.5, step: 0.02 },
		{ key: 'buoy', label: 'rise', min: 0, max: 20, step: 0.5 },
		{ key: 'swirl', label: 'turbulence', min: 0, max: 25, step: 0.5 },
		{ key: 'drag', label: 'drag', min: 0, max: 3, step: 0.05 },
		{ key: 'inherit', label: 'path streak', min: 0, max: 1, step: 0.05 },
		{ key: 'pstr', label: 'smoke opacity', min: 0.1, max: 3, step: 0.05 },
		{ key: 'cap', label: 'max particles', min: 100, max: 1500, step: 20 }
	];

	function set(key: NumKey, e: Event) {
		cfg[key] = +(e.currentTarget as HTMLInputElement).value;
	}
</script>

<div class="panel" class:open>
	<button class="head" onclick={() => (open = !open)} aria-expanded={open}>
		<span class="chev">{open ? '▾' : '▸'}</span>
		<span class="title">tinker</span>
		<span class="hint">// mess with the shader</span>
	</button>

	{#if open}
		<div class="body">
			{#each sliders as s (s.key)}
				<label class="row">
					<span class="lbl">{s.label}</span>
					<input type="range" min={s.min} max={s.max} step={s.step} value={cfg[s.key]} oninput={(e) => set(s.key, e)} />
					<span class="val">{cfg[s.key]}</span>
				</label>
			{/each}

			<label class="row check">
				<input type="checkbox" checked={cfg.glitch} onchange={(e) => (cfg.glitch = e.currentTarget.checked)} />
				<span class="lbl">glitch bursts</span>
			</label>

			<button class="reset" onclick={resetConfig}>[ reset ]</button>
		</div>
	{/if}
</div>

<style>
	.panel {
		position: fixed;
		top: 0.9rem;
		left: 0.9rem;
		z-index: 60;
		width: 250px;
		max-width: calc(100vw - 1.8rem);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--dim);
		background: color-mix(in srgb, var(--bg) 78%, transparent);
		border: 1px solid var(--dim);
		backdrop-filter: blur(5px);
	}

	.head {
		display: flex;
		align-items: center;
		gap: 0.5ch;
		width: 100%;
		padding: 0.45rem 0.6rem;
		background: transparent;
		border: 0;
		font: inherit;
		color: var(--text);
		cursor: pointer;
		text-align: left;
	}

	.panel.open .head {
		border-bottom: 1px solid var(--dim);
	}

	.chev {
		color: var(--accent);
	}

	.title {
		color: var(--accent);
		font-weight: 700;
	}

	.hint {
		color: var(--dim);
		margin-left: auto;
	}

	.body {
		padding: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-height: min(70vh, 520px);
		overflow-y: auto;
	}

	.row {
		display: grid;
		grid-template-columns: 6.5em 1fr 2.6em;
		align-items: center;
		gap: 0.6ch;
	}

	.lbl {
		color: var(--dim);
	}

	.val {
		color: var(--accent);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.check {
		grid-template-columns: auto 1fr;
		margin-top: 0.2rem;
	}

	input[type='range'] {
		width: 100%;
		height: 2px;
		accent-color: var(--accent);
		cursor: pointer;
	}

	input[type='checkbox'] {
		accent-color: var(--accent);
		cursor: pointer;
	}

	.reset {
		margin-top: 0.5rem;
		align-self: flex-start;
		background: transparent;
		border: 0;
		font: inherit;
		color: var(--accent);
		cursor: pointer;
		padding: 0.1em 0.2em;

		&:hover {
			color: var(--bg);
			background: var(--accent);
		}
	}
</style>
