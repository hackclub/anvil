<script lang="ts">
	import { onMount } from 'svelte';
	import { fbm, hash2 } from './noise';
	import { measureCharWidth } from './measureChar';

	interface Props {
		cell?: number;
	}

	let { cell = 15 }: Props = $props();

	let host: HTMLDivElement;
	let pre: HTMLPreElement;

	const GLYPHS = '.:-=+*/\\<>[]{}?#·';
	// posterize a smooth fbm map into bands -> regions with SUDDEN edges.
	// each band controls how densely random glyphs fill that region.
	const BANDS = [0, 0.04, 0.12, 0.28, 0.5];

	onMount(() => {
		let cols = 0;
		let rows = 0;
		let charW = 8;

		function measure() {
			charW = measureCharWidth(cell, host);
			const r = host.getBoundingClientRect();
			cols = Math.max(1, Math.ceil(r.width / charW) + 1);
			rows = Math.max(1, Math.ceil(r.height / cell) + 1);
		}

		function render() {
			let out = '';
			for (let y = 0; y < rows; y++) {
				for (let x = 0; x < cols; x++) {
					// smooth map -> quantized band index
					const m = fbm(x * 0.05, y * 0.09, 3);
					let b = (m * BANDS.length) | 0;
					if (b < 0) {
						b = 0;
					} else if (b >= BANDS.length) {
						b = BANDS.length - 1;
					}

					const dens = BANDS[b];
					if (hash2(x * 3 + 1, y * 7 + 2) < dens) {
						out += GLYPHS[(hash2(x * 5, y * 11) * GLYPHS.length) | 0];
					} else {
						out += ' ';
					}
				}

				out += '\n';
			}

			pre.textContent = out;
		}

		measure();
		render();
		const ro = new ResizeObserver(() => {
			measure();
			render();
		});

		ro.observe(host);

		return () => ro.disconnect();
	});
</script>

<div class="fnoise" bind:this={host} aria-hidden="true" style="--fs:{cell}px">
	<pre bind:this={pre}></pre>
</div>

<style>
	.fnoise {
		position: absolute;
		inset: 0;
		overflow: hidden;
		opacity: 0.12;

		/* very slight */
		pointer-events: none;
	}

	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--fs);
		line-height: var(--fs);
		color: var(--dim);
		white-space: pre;
		user-select: none;
	}
</style>
