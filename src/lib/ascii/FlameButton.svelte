<script lang="ts">
	// The dashboard's empty state, rendered ENTIRELY inside one ASCII host:
	// wrapped intro text, a box-drawing terminal button, the guide line, and
	// subtle flames licking around the button's hearth. A transparent <a>
	// hotspot overlays the drawn button; hovering inverts it (inverse video),
	// exactly like the homepage's forge terminal.
	import { onMount } from 'svelte';
	import { fbm, hash2 } from './noise';
	import { measureCharWidth } from './measureChar';

	interface Props {
		intro: string;
		label: string;
		outro: string;
		href: string;
		/** optional page heading (e.g. "~/projects") baked top-left into the grid */
		heading?: string;
		cell?: number;
	}

	let { intro, label, outro, href, heading, cell = 16 }: Props = $props();

	let host: HTMLDivElement;
	let pre: HTMLPreElement;
	let hovered = $state(false);
	let totalRows = $state(12);
	let hotspot = $state({ x: 0, y: 0, w: 0, h: 0 });

	// set inside onMount; lets the reduced-motion path still redraw on hover
	let requestRender: () => void = () => {};
	$effect(() => {
		void hovered;
		requestRender();
	});

	const RAMP = ' ·:=+*#';

	function wrapText(text: string, maxW: number): string[] {
		const words = text.split(' ');
		const lines: string[] = [];
		let line = '';
		for (const w of words) {
			if (line && line.length + 1 + w.length > maxW) {
				lines.push(line);
				line = w;
			} else {
				line = line ? line + ' ' + w : w;
			}
		}

		if (line) {
			lines.push(line);
		}

		return lines;
	}

	onMount(() => {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		let cols = 0;
		let charW = 8;

		function measure() {
			charW = measureCharWidth(cell, host);
			cols = Math.max(20, Math.ceil(host.getBoundingClientRect().width / charW));
		}

		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(host);

		let heat = 0;

		interface Cell {
			ch: string;
			cls: string;
		}

		function render(t: number) {
			heat += ((hovered ? 1 : 0) - heat) * 0.1;

			// ── layout: everything in cell coords, centered, text wrapped ──
			// manual '\n' breaks are honored, then each segment word-wraps
			const maxTextW = Math.min(cols - 6, 76);
			const introLines = intro.split('\n').flatMap((seg) => wrapText(seg, maxTextW));
			const outroLines = outro.split('\n').flatMap((seg) => wrapText(seg, maxTextW));

			const btnText = `${label}`;
			const btnW = btnText.length + 4; // │ + space each side
			const bx0 = Math.max(0, (cols - btnW) >> 1);

			let y = 0;
			const grid = new Map<number, { x0: number; cells: Cell[] }[]>();
			const put = (row: number, x0: number, cells: Cell[]) => {
				const list = grid.get(row) ?? [];
				list.push({ x0, cells });
				grid.set(row, list);
			};

			const text = (row: number, str: string, cls: string) => {
				return put(
					row,
					Math.max(0, (cols - str.length) >> 1),
					[...str].map((ch) => ({ ch, cls }))
				);
			};

			// page heading, top-left, in-grid ("~/" dim, rest bright)
			if (heading) {
				const dimLead = heading.startsWith('~/') ? 2 : 0;
				put(y, 0, [
					...[...heading.slice(0, dimLead)].map((ch) => ({ ch, cls: '' })),
					...[...heading.slice(dimLead)].map((ch) => ({ ch, cls: 'c4' }))
				]);

				y += 3;
			} else {
				y += 1;
			}

			for (const line of introLines) text(y++, line, 'c3');
			y += 4; // flame headroom - let the plumes climb
			const by0 = y; // button top row
			const inner = '─'.repeat(btnW - 2);
			const labelCls = hovered ? 'inv' : 'c2';
			put(
				by0,
				bx0,
				[...`╭${inner}╮`].map((ch) => ({ ch, cls: 'c2' }))
			);

			put(by0 + 1, bx0, [
				{ ch: '│', cls: 'c2' },
				{ ch: ' ', cls: labelCls },
				...[...btnText].map((ch) => ({ ch, cls: labelCls })),
				{ ch: ' ', cls: labelCls },
				{ ch: '│', cls: 'c2' }
			]);

			put(
				by0 + 2,
				bx0,
				[...`╰${inner}╯`].map((ch) => ({ ch, cls: 'c2' }))
			);

			const hearthY = by0 + 2;
			y = by0 + 3;
			y += 3; // room for embers falling off the hearth
			for (const line of outroLines) text(y++, line, 'c3');
			const rows = y + 1;
			if (rows !== totalRows) {
				totalRows = rows;
			}

			// hotspot px rect over the drawn button (small state churn guard)
			const hx = Math.round(bx0 * charW);
			const hy = Math.round(by0 * cell);
			const hw = Math.round(btnW * charW);
			const hh = 3 * cell;
			if (hotspot.x !== hx || hotspot.y !== hy || hotspot.w !== hw || hotspot.h !== hh) {
				hotspot = { x: hx, y: hy, w: hw, h: hh };
			}

			// ── paint: content first, flames in the gaps ───────────────────
			let out = '';
			let cur = '';
			const setRun = (cls: string) => {
				if (cls === cur) return;

				if (cur) {
					out += '</span>';
				}

				if (cls) {
					out += '<span class="' + cls + '">';
				}

				cur = cls;
			};

			for (let ry = 0; ry < rows; ry++) {
				const spans = grid.get(ry) ?? [];
				for (let x = 0; x < cols; x++) {
					// content cells are sacred
					const span = spans.find((s) => x >= s.x0 && x < s.x0 + s.cells.length);
					if (span) {
						const c = span.cells[x - span.x0];
						setRun(c.ch === ' ' ? c.cls : c.cls); // keep inv bg on spaces
						out += c.ch;
						continue;
					}

					// flames EMANATE from the button: intensity anchors on the box
					// rectangle itself - plumes rise off the top edge, short licks
					// curl off the sides, embers drop from the hearth below
					const dxr = Math.max(bx0 - x, x - (bx0 + btnW - 1), 0);
					let base: number;
					if (ry > hearthY) {
						base = 1 - (ry - hearthY) * 0.45 - dxr * 0.3;
					} else if (ry >= by0) {
						base = 1.05 - dxr * 0.24;
					} else {
						base = 1.05 - (by0 - ry) * 0.13 - dxr * 0.28;
					}

					if (base <= 0) {
						setRun('');
						out += ' ';
						continue;
					}
					// rising advection + column gating so the plumes split into
					// distinct tongues that sway over time
					const turb = fbm(x * 0.19 + 9, ry * 0.35 - t * 2.6, 2);
					const tongue = 0.55 + 0.7 * fbm(x * 0.42 + 31, t * 0.9, 1);
					let v = base * (0.28 + 1.05 * turb) * tongue * (0.75 + heat * 0.6);
					// attached glow: cells hugging the box border ALWAYS burn, so the
					// fire visibly grips the button instead of floating behind it
					const rectD = dxr + (ry < by0 ? by0 - ry : ry > hearthY ? ry - hearthY : 0);
					v += Math.max(0, 1 - rectD * 0.34) * (0.25 + 0.55 * turb) * (0.8 + heat * 0.5);
					v *= 0.8 + hash2(x, ry + ((t * 10) | 0)) * 0.45;

					let idx = (v * RAMP.length) | 0;
					if (idx <= 0) {
						setRun('');
						out += ' ';
						continue;
					}

					if (idx >= RAMP.length) {
						idx = RAMP.length - 1;
					}

					setRun(v > 0.78 ? 'c2' : v > 0.5 ? 'c1' : '');
					out += RAMP[idx];
				}

				if (ry < rows - 1) {
					out += '\n';
				}
			}

			if (cur) {
				out += '</span>';
			}

			pre.innerHTML = out;
		}

		let raf = 0;
		const startT = performance.now();
		function frame(now: number) {
			render((now - startT) / 1000);
			raf = requestAnimationFrame(frame);
		}

		if (reduced) {
			render(2.7);
			requestRender = () => render(2.7); // hover inversion still works
		} else {
			raf = requestAnimationFrame(frame);
		}

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	});
</script>

<div class="scene" bind:this={host} style="--fs: {cell}px; height: {totalRows * cell}px">
	<pre bind:this={pre} aria-hidden="true"></pre>
	<a
		class="hotspot"
		{href}
		aria-label={label}
		style="left:{hotspot.x}px;top:{hotspot.y}px;width:{hotspot.w}px;height:{hotspot.h}px"
		onpointerenter={() => (hovered = true)}
		onpointerleave={() => (hovered = false)}
	></a>
	<p class="sr-only">{intro} {outro}</p>
</div>

<style>
	.scene {
		position: relative;
	}

	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--fs);
		line-height: var(--fs);
		color: var(--dim);
		white-space: pre;
		user-select: none;

		:global(.c1) {
			color: color-mix(in srgb, var(--accent) 45%, var(--dim));
		}

		:global(.c2) {
			color: var(--accent);
		}

		:global(.c3) {
			color: var(--text);
		}

		:global(.c4) {
			color: var(--text);
			font-weight: 700;
		}

		/* inverse video - the terminal way to show a hot button */
		:global(.inv) {
			background: var(--accent);
			color: var(--bg);
		}
	}

	.hotspot {
		position: absolute;
		cursor: pointer;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}
</style>
