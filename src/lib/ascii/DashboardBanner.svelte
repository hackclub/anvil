<script lang="ts">
	// Full-bleed animated ASCII banner for the platform dashboard.
	// Abstract "laminar drift": layered fbm streaks flowing horizontally at
	// per-band speeds, sparse glyphs, occasional accent embers. The welcome
	// line + MOTD are baked straight into the grid; instead of a hard carved
	// rectangle, a noisy distance falloff lets background characters bleed
	// back in near the text - but cells holding text are never overwritten.
	import { onMount } from 'svelte';
	import { fbm, hash2 } from './noise';
	import { measureCharWidth } from './measureChar';

	export interface MotdSegment {
		text: string;
		accent?: boolean;
	}

	interface Props {
		username: string;
		motd?: MotdSegment[];
		rows?: number;
		cell?: number;
	}

	let { username, motd = [], rows = 18, cell = 16 }: Props = $props();

	let host: HTMLDivElement;
	let pre: HTMLPreElement;

	const RAMP = ' ·:-=+*#';
	const EMBERS = "*+'·";

	onMount(() => {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		let cols = 0;
		let charW = 8;

		function measure() {
			charW = measureCharWidth(cell, host);
			cols = Math.max(1, Math.ceil(host.getBoundingClientRect().width / charW) + 1);
		}

		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(host);

		// cursor: gently warps the flow around the pointer (cell coords, lerped)
		let tmx = -999;
		let tmy = -999;
		let mx = -999;
		let my = -999;
		let mp = 0;
		function onMove(e: MouseEvent) {
			const r = host.getBoundingClientRect();
			tmx = (e.clientX - r.left) / charW;
			tmy = (e.clientY - r.top) / cell;
		}

		window.addEventListener('mousemove', onMove);

		// ── text lines baked into the grid ─────────────────────────────────
		// cls: '' = dim field color, 'c2' = accent, 'c3' = bright text
		interface TextLine {
			y: number;
			x0: number;
			cells: { ch: string; cls: string }[];
		}

		function buildLines(): TextLine[] {
			const mid = (rows - 1) >> 1;
			// tighter left indent on narrow screens so the welcome/motd copy isn't
			// squeezed into a sliver (and roughly aligns with the gutter below)
			const x0 = cols < 56 ? 2 : 6;
			const toCells = (segs: MotdSegment[]) =>
				segs.flatMap((s) => [...s.text].map((ch) => ({ ch, cls: s.accent ? 'c2' : 'c3' })));

			// word-wrap onto the grid so narrow screens don't clip the text
			// mid-line; on desktop everything fits and nothing changes.
			// cols overshoots the visible width by ~1 (the +1 in measure()), so
			// -3 keeps the last glyph clear of the clipped edge
			const maxW = Math.max(12, cols - x0 - 3);
			const wrapCells = (cells: { ch: string; cls: string }[]) => {
				const words: (typeof cells)[] = [];
				let word: typeof cells = [];
				for (const c of cells) {
					if (c.ch !== ' ') {
						word.push(c);
					} else if (word.length) {
						words.push(word);
						word = [];
					}
				}

				if (word.length) {
					words.push(word);
				}

				const out: (typeof cells)[] = [[]];
				for (const w of words) {
					const line = out[out.length - 1];
					if (line.length && line.length + 1 + w.length > maxW) {
						out.push([...w]);
					} else {
						if (line.length) {
							line.push({ ch: ' ', cls: '' });
						}

						line.push(...w);
					}
				}

				return out;
			};

			const lines: TextLine[] = [];
			let y = mid - 1;
			for (const cells of wrapCells(
				toCells([{ text: 'welcome, ' }, { text: `@${username}`, accent: true }, { text: '!' }])
			)) {
				lines.push({ y: y++, x0, cells });
			}

			y++; // the blank row between the welcome line and the motd
			if (motd.length > 0) {
				for (const cells of wrapCells(toCells(motd))) {
					lines.push({ y: y++, x0, cells });
				}
			}

			// ── the three-step pitch, cascading down-right as ascii panes ──
			//   ╭ 1 ──────────────╮
			//   │ ship projects   │
			//   ╰─────────────────╯ »
			//      ╭ 2 ──…
			const steps = ['ship projects', 'get ✶ sparks (more viral = more sparks!)', 'spend them in the shop!'];
			// a real staircase: LEFT edges step right by STAGGER each, right
			// edges stay ragged (widths differ) - reads as a clean ↘ cascade
			const STAGGER = 6;
			const paneW = (t: string) => t.length + 4; // │ + spaces + │
			const rightEdge = cols - 14; // pulled in from the edge, not hugging it
			const baseX = Math.min(...steps.map((t, i) => rightEdge - paneW(t) - i * STAGGER));
			const textRight = x0 + Math.max(...lines.map((l) => l.cells.length));
			// only when the panes genuinely fit beside the welcome text
			if (rows >= 13 && baseX > textRight + 6) {
				const topY = Math.max(1, (rows - 11) >> 1);
				steps.forEach((text, i) => {
					const inner = text.length + 2;
					const px = baseX + i * STAGGER;
					const py = topY + i * 4;
					const cells = (str: string, cls = '') => [...str].map((ch) => ({ ch, cls }));
					lines.push(
						{
							y: py,
							x0: px,
							cells: [...cells('╭ '), { ch: String(i + 1), cls: 'c2' }, ...cells(` ${'─'.repeat(inner - 3)}╮`)]
						},
						{
							y: py + 1,
							x0: px,
							cells: [...cells('│ '), ...[...text].map((ch) => ({ ch, cls: ch === '✶' ? 'c2' : 'c3' })), ...cells(' │')]
						},
						{ y: py + 2, x0: px, cells: cells(`╰${'─'.repeat(inner)}╯`) }
					);
				});
			}

			return lines;
		}

		function render(t: number) {
			if (tmx > -900) {
				if (mx < -900) {
					mx = tmx;
					my = tmy;
				}

				mx += (tmx - mx) * 0.2;
				my += (tmy - my) * 0.2;
			}

			const inBanner = tmy >= -1 && tmy <= rows + 1 && tmx >= 0 && tmx <= cols;
			mp += ((inBanner ? 1 : 0) - mp) * 0.08;

			const lines = buildLines();

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

			for (let y = 0; y < rows; y++) {
				const band = 1 - Math.abs(y - (rows - 1) / 2) / ((rows - 1) / 2 || 1);
				const speed = 1.2 + band * 2.4;

				for (let x = 0; x < cols; x++) {
					// text cells are sacred - render and move on
					let isText = false;
					let dText = Infinity;
					for (const line of lines) {
						const dx = Math.max(line.x0 - x, x - (line.x0 + line.cells.length - 1), 0);
						const dy = y - line.y;
						if (dx === 0 && dy === 0) {
							const cellT = line.cells[x - line.x0];
							setRun(cellT.ch === ' ' ? '' : cellT.cls);
							out += cellT.ch === '✶' ? '<span class="spark">✶</span>' : cellT.ch;
							isText = true;
							break;
						}
						// rows count double so the clearing reads round-ish
						const d = Math.hypot(dx, dy * 2.2);
						if (d < dText) {
							dText = d;
						}
					}

					if (isText) continue;

					// cursor warp: the flow bends around the pointer
					let wx = x;
					let wy = y;
					if (mp > 0.01) {
						const dx = (x - mx) * 0.5;
						const dy = y - my;
						const d = Math.hypot(dx, dy);
						const k = mp * Math.exp(-d * 0.18) * 3.5;
						wx += (dx / (d + 0.6)) * k;
						wy += (dy / (d + 0.6)) * k;
					}

					// layered streaks: broad flow + fine shimmer
					let v = fbm(wx * 0.035 - t * speed * 0.22, wy * 0.24 + t * 0.05, 2);
					v += (fbm(wx * 0.11 - t * speed * 0.4, wy * 0.5 - t * 0.03, 2) - 0.5) * 0.5;
					v = (v - 0.38) * 1.7; // sparse: most cells stay empty

					// clearing around the text with a noisy, bleeding edge:
					// d<=1.2 guaranteed clear; beyond that the field fades back in
					// with per-cell jitter, so stray glyphs creep close organically
					if (dText < 7) {
						const jitter = (hash2(x * 3 + 1, y * 5 + 2) - 0.5) * 1.6;
						const k = Math.min(1, Math.max(0, (dText - 1.2 + jitter) / 5));
						v *= k * k;
					}

					let idx = (v * RAMP.length) | 0;
					if (idx <= 0) {
						setRun('');
						out += ' ';
						continue;
					}

					if (idx >= RAMP.length) {
						idx = RAMP.length - 1;
					}

					if (v > 0.82 && hash2(x, y + ((t * 6) | 0)) > 0.6) {
						setRun('c2');
						out += EMBERS[(hash2(x * 3, y * 7 + ((t * 4) | 0)) * EMBERS.length) | 0];
					} else {
						setRun(v > 0.62 ? 'c1' : '');
						out += RAMP[idx];
					}
				}

				if (y < rows - 1) {
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
			render(4.2);
		} else {
			raf = requestAnimationFrame(frame);
		}

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			window.removeEventListener('mousemove', onMove);
		};
	});
</script>

<div class="banner" style="--rows: {rows}; --fs: {cell}px">
	<div class="field" bind:this={host} aria-hidden="true">
		<pre bind:this={pre}></pre>
	</div>
	<p class="sr-only">
		welcome, @{username}! {motd.map((s) => s.text).join('')} - 1. ship projects, 2. get sparks (more viral = more sparks!),
		3. spend them in the shop!
	</p>
</div>

<style>
	/* full viewport bleed out of any padded container */
	.banner {
		position: relative;
		width: 100vw;
		margin-inline: calc(50% - 50vw);
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 35%, transparent);
		overflow: hidden;
	}

	.field {
		height: calc(var(--rows) * var(--fs));
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
			color: color-mix(in srgb, var(--text) 55%, var(--dim));
		}

		:global(.c2) {
			color: var(--accent);
		}

		:global(.c3) {
			color: var(--text);
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
</style>
