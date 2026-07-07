<script lang="ts">
	import { onMount } from 'svelte';
	import { forgeWindow } from './forgeWindow.svelte';
	import { measureCharWidth } from './measureChar';

	interface Props {
		cell?: number;
	}

	let { cell = 16 }: Props = $props();

	let host: HTMLDivElement;
	let pre: HTMLPreElement;

	// which button is hovered (-1 none). driven by the transparent <a> hotspots,
	// read by the render loop so the ASCII button inverts in sync.
	let hovered = $state(-1);
	// px rects for the clickable overlays, recomputed on resize
	let btns = $state<{ x: number; y: number; w: number; h: number }[]>([]);
	// solid backgrounds live as positioned layers (NOT per-cell spans) so the
	// tight line-height needed for box-drawing doesn't overpaint text descenders.
	type Rect = { x: number; y: number; w: number; h: number };
	let winRect = $state<Rect | null>(null);
	// title-bar drag handle rect
	let handle = $state<Rect | null>(null);

	// user drag offset (px) from the centered home position; persists across resize
	let offX = 0;
	let offY = 0;
	// re-place the window after a drag; assigned inside onMount
	let doPlace: () => void = () => {};

	// title-bar dragging
	let dragging = $state(false);
	let sx = 0,
		sy = 0,
		sox = 0,
		soy = 0;

	function dragStart(e: PointerEvent) {
		dragging = true;
		sx = e.clientX;
		sy = e.clientY;
		sox = offX;
		soy = offY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function dragMove(e: PointerEvent) {
		if (!dragging) return;

		offX = sox + (e.clientX - sx);
		offY = soy + (e.clientY - sy);
		doPlace();
	}

	function dragEnd() {
		dragging = false;
	}

	const BTN_LABELS = ['▸ enter platform'];

	onMount(() => {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		let cols = 0;
		let rows = 0;
		let charW = 8;
		let ch: string[] = [];
		let fg: Int8Array = new Int8Array(0);
		let bg: Int8Array = new Int8Array(0);

		// window geometry (in cells) + button cell-rects, all recomputed on measure
		let x0 = 0,
			y0 = 0,
			winW = 52,
			winH = 18;

		let btnCells: { x: number; y: number; w: number; h: number }[] = [];

		const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

		function layout() {
			winW = Math.max(30, Math.min(54, cols - 2));
			winH = 9;
			// centered "home" position; the drag offset shifts from here
			const baseX0 = Math.floor((cols - winW) / 2);
			const baseY0 = Math.floor((rows - winH) / 2);

			doPlace = () => {
				x0 = clamp(baseX0 + Math.round(offX / charW), 0, cols - winW);
				y0 = clamp(baseY0 + Math.round(offY / cell), 0, rows - winH);

				// button group centered on its row
				const bw = BTN_LABELS.map((l) => l.length + 4); // "[ label ]"
				const gap = 3;
				const groupW = bw.reduce((a, w) => a + w, 0) + gap * (bw.length - 1);
				const by = y0 + winH - 3;
				let bx = x0 + Math.floor((winW - groupW) / 2);
				btnCells = [];
				for (let i = 0; i < bw.length; i++) {
					btnCells.push({ x: bx, y: by, w: bw[i], h: 1 });
					bx += bw[i] + gap;
				}

				btns = btnCells.map((b) => ({
					x: b.x * charW,
					y: b.y * cell,
					w: b.w * charW,
					h: b.h * cell
				}));

				winRect = { x: x0 * charW, y: y0 * cell, w: winW * charW, h: winH * cell };
				// draggable strip = top border + title + separator (3 rows)
				handle = { x: x0 * charW, y: y0 * cell, w: winW * charW, h: 3 * cell };

				// publish the window's center (in cells) so the rings track it
				forgeWindow.cx = x0 + winW / 2;
				forgeWindow.cy = y0 + winH / 2;
				forgeWindow.active = true;
			};

			doPlace();
		}

		function measure() {
			charW = measureCharWidth(cell, host);
			const r = host.getBoundingClientRect();
			cols = Math.max(1, Math.ceil(r.width / charW) + 1);
			rows = Math.max(1, Math.ceil(r.height / cell) + 1);
			ch = new Array(cols * rows).fill(' ');
			fg = new Int8Array(cols * rows);
			bg = new Int8Array(cols * rows);
			layout();
		}

		measure();
		const ro = new ResizeObserver(() => {
			measure();
			if (reduced) {
				render(0);
			}
		});

		ro.observe(host);

		function set(x: number, y: number, c: string, f: number, b = -1) {
			if (x < 0 || y < 0 || x >= cols || y >= rows) return;

			const i = y * cols + x;
			ch[i] = c;
			fg[i] = f;
			if (b >= 0) {
				bg[i] = b;
			}
		}

		function text(x: number, y: number, s: string, f: number, b = -1) {
			for (let k = 0; k < s.length; k++) set(x + k, y, s[k], f, b);
		}

		// fg codes: 0 dim(frame) · 1 soft body · 2 accent · 3 bright · 4 on-accent(bg color)
		// bg codes: 0 none · 1 window · 2 accent(title/hover)
		function render(t: number) {
			ch.fill(' ');
			fg.fill(0);
			bg.fill(0);

			// drop shadow (down-right), classic DOS
			for (let yy = y0 + 1; yy <= y0 + winH; yy++) set(x0 + winW, yy, '░', 0);
			for (let xx = x0 + 1; xx <= x0 + winW; xx++) set(xx, y0 + winH, '░', 0);

			// solid window fill
			for (let yy = y0; yy < y0 + winH; yy++) for (let xx = x0; xx < x0 + winW; xx++) set(xx, yy, ' ', 0, 1);

			// double-line border
			const R = x0 + winW - 1;
			const B = y0 + winH - 1;
			set(x0, y0, '╔', 0, 1);
			set(R, y0, '╗', 0, 1);
			set(x0, B, '╚', 0, 1);
			set(R, B, '╝', 0, 1);
			for (let xx = x0 + 1; xx < R; xx++) {
				set(xx, y0, '═', 0, 1);
				set(xx, B, '═', 0, 1);
			}

			for (let yy = y0 + 1; yy < B; yy++) {
				set(x0, yy, '║', 0, 1);
				set(R, yy, '║', 0, 1);
			}
			// title bar (matches the terminal background - no accent fill)
			set(x0 + 2, y0 + 1, '≡', 0);
			const title = ' anvil.hackclub.com ';
			text(x0 + Math.floor((winW - title.length) / 2), y0 + 1, title, 2);
			text(R - 4, y0 + 1, '[×]', 0);
			set(x0, y0 + 2, '╠', 0, 1);
			set(R, y0 + 2, '╣', 0, 1);
			for (let xx = x0 + 1; xx < R; xx++) set(xx, y0 + 2, '═', 0, 1);

			const midX = x0 + Math.floor(winW / 2);
			const cen = (s: string) => midX - Math.floor(s.length / 2);

			// heading (centered) - "ready to ship?"
			const h1 = 'ready to ';
			const h2 = 'ship';
			const hx = cen('ready to ship?');
			text(hx, y0 + 4, h1, 3);
			text(hx + h1.length, y0 + 4, h2, 2);
			text(hx + h1.length + h2.length, y0 + 4, '?', 3);

			// buttons (invert on hover)
			for (let i = 0; i < btnCells.length; i++) {
				const b = btnCells[i];
				const hot = hovered === i;
				const bgc = hot ? 2 : 1;
				const brk = hot ? 4 : 2;
				const lbl = hot ? 4 : i === 0 ? 3 : 1;
				set(b.x, b.y, '[', brk, bgc);
				set(b.x + 1, b.y, ' ', lbl, bgc);
				text(b.x + 2, b.y, BTN_LABELS[i], lbl, bgc);
				set(b.x + b.w - 2, b.y, ' ', lbl, bgc);
				set(b.x + b.w - 1, b.y, ']', brk, bgc);
			}

			// ── build run-length coalesced spans ─────────────────────────────
			const esc = (c: string) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c);

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
				for (let x = 0; x < cols; x++) {
					const i = y * cols + x;
					const f2 = fg[i];
					// backgrounds are drawn as positioned layers, not per-cell spans
					setRun(f2 ? 'f' + f2 : '');
					out += esc(ch[i]);
				}

				out += '\n';
			}

			if (cur) {
				out += '</span>';
			}

			pre.innerHTML = out;
		}

		let raf = 0;
		let visible = false;
		const startT = performance.now();
		function frame(now: number) {
			render((now - startT) / 1000);
			raf = requestAnimationFrame(frame);
		}

		function play() {
			if (!raf) {
				raf = requestAnimationFrame(frame);
			}
		}

		function pause() {
			cancelAnimationFrame(raf);
			raf = 0;
		}

		const io = new IntersectionObserver((e) => {
			visible = e[0].isIntersecting;
			if (reduced) {
				if (visible) {
					render(3);
				}
			} else if (visible) {
				play();
			} else {
				pause();
			}
		});

		io.observe(host);

		return () => {
			pause();
			ro.disconnect();
			io.disconnect();
		};
	});
</script>

<div class="forge" bind:this={host} style="--fs:{cell}px">
	<!-- solid backgrounds (behind the glyph layer) -->
	{#if winRect}
		<div class="fill" style="left:{winRect.x}px;top:{winRect.y}px;width:{winRect.w}px;height:{winRect.h}px"></div>
	{/if}
	{#if hovered >= 0 && btns[hovered]}
		<div
			class="btnhi"
			style="left:{btns[hovered].x}px;top:{btns[hovered].y}px;width:{btns[hovered].w}px;height:{btns[hovered].h}px"
		></div>
	{/if}

	<pre bind:this={pre} aria-hidden="true"></pre>

	<!-- drag the title bar to move the window (rings follow its center) -->
	{#if handle}
		<div
			class="handle"
			class:dragging
			style="left:{handle.x}px;top:{handle.y}px;width:{handle.w}px;height:{handle.h}px"
			onpointerdown={dragStart}
			onpointermove={dragMove}
			onpointerup={dragEnd}
			onpointercancel={dragEnd}
			role="presentation"
		></div>
	{/if}

	<!-- transparent clickable hotspots, aligned to the ASCII buttons -->
	{#each btns as b, i (i)}
		<a
			class="hotspot"
			href="/auth/login"
			aria-label={BTN_LABELS[i].replace(/^[▸#]\s*/, '')}
			style="left:{b.x}px;top:{b.y}px;width:{b.w}px;height:{b.h}px"
			onpointerenter={() => (hovered = i)}
			onpointerleave={() => (hovered = -1)}
		></a>
	{/each}

	<!-- accessible content (visually hidden; the window above is aria-hidden) -->
	<div class="sr-only">
		<h2>ready to ship?</h2>
		<p>Ship one good tool and watch it run red-hot. Every star, install, and download stokes the fire.</p>
	</div>
</div>

<style>
	.forge {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
	}

	pre {
		position: relative;
		z-index: 1;
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--fs);
		line-height: var(--fs);
		color: var(--dim);
		white-space: pre;
		user-select: none;
		pointer-events: none;

		/* fg codes */
		:global(.f1) {
			color: color-mix(in srgb, var(--text) 68%, var(--dim));
		}

		:global(.f2) {
			color: var(--accent);
		}

		:global(.f3) {
			color: var(--text);
		}

		:global(.f4) {
			color: var(--bg);
		}
	}

	.fill,
	.btnhi {
		position: absolute;
		z-index: 0;
		pointer-events: none;
	}

	.fill {
		background: var(--bg-soft);
	}

	.btnhi {
		background: var(--accent);
	}

	.hotspot {
		position: absolute;
		z-index: 3;
		display: block;
		pointer-events: auto;
		cursor: pointer;
	}

	.handle {
		position: absolute;
		z-index: 3;
		pointer-events: auto;
		cursor: grab;
		touch-action: none;

		&.dragging {
			cursor: grabbing;
		}
	}
</style>
