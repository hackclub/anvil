<script lang="ts">
	import { onMount } from 'svelte';
	import { hash2, fbm } from './noise';
	import { measureCharWidth } from './measureChar';

	interface Props {
		cell?: number;
	}

	let { cell = 16 }: Props = $props();

	let host: HTMLDivElement;
	let pre: HTMLPreElement;

	// depth layers: far -> near. near = bigger, heavier lines, brighter, and
	// scrolls DOWN faster (bigger parallax factor). Panels are tall (vertical),
	// randomly jittered + skipped so they scatter instead of forming a grid.
	const LAYERS = [
		{
			pw: 9,
			ph: 11,
			gapx: 12,
			gapy: 8,
			pfac: 0.12,
			heavy: false,
			block: false,
			ci: 0,
			jit: 3,
			skip: 0.45
		},
		{
			pw: 3,
			ph: 9,
			gapx: 7,
			gapy: 6,
			pfac: 0.22,
			heavy: false,
			block: true,
			ci: 0,
			jit: 4,
			skip: 0.5
		},
		{
			pw: 12,
			ph: 15,
			gapx: 14,
			gapy: 10,
			pfac: 0.28,
			heavy: false,
			block: false,
			ci: 1,
			jit: 4,
			skip: 0.4
		},
		{
			pw: 2,
			ph: 13,
			gapx: 6,
			gapy: 7,
			pfac: 0.42,
			heavy: false,
			block: true,
			ci: 1,
			jit: 3,
			skip: 0.55
		},
		{
			pw: 16,
			ph: 20,
			gapx: 18,
			gapy: 12,
			pfac: 0.5,
			heavy: true,
			block: false,
			ci: 2,
			jit: 5,
			skip: 0.35
		}
	];

	// lil blobs that pinch off the rift rim, drift outward, and shrink away
	interface RimBlob {
		ang: number;
		born: number;
		spd: number;
		life: number;
		s0: number;
	}

	onMount(() => {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const blobs: RimBlob[] = [];
		let nextSpawn = 0;
		let spawnSeed = 0;
		let cols = 0;
		let rows = 0;
		let charW = 8;
		let ch: string[] = [];
		let ci: Int8Array = new Int8Array(0);

		// cursor (cell coords relative to this section) + presence, both lerped
		let tmx = -999,
			tmy = -999,
			mx = -999,
			my = -999,
			tPresent = 0,
			mPresent = 0;

		function measure() {
			charW = measureCharWidth(cell, host);
			const r = host.getBoundingClientRect();
			cols = Math.max(1, Math.ceil(r.width / charW) + 1);
			rows = Math.max(1, Math.ceil(r.height / cell) + 1);
			ch = new Array(cols * rows).fill(' ');
			ci = new Int8Array(cols * rows);
		}

		measure();
		const ro = new ResizeObserver(() => {
			measure();
			if (reduced) {
				render(sm, 0);
			}
		});

		ro.observe(host);

		function onMove(e: MouseEvent) {
			const r = host.getBoundingClientRect();
			const lx = (e.clientX - r.left) / charW;
			const ly = (e.clientY - r.top) / cell;
			tmx = lx;
			tmy = ly;
			tPresent = lx >= 0 && ly >= 0 && lx <= cols && ly <= rows ? 1 : 0;
		}

		window.addEventListener('mousemove', onMove);

		function set(x: number, y: number, c: string, color: number) {
			if (x < 0 || y < 0 || x >= cols || y >= rows) return;

			const i = y * cols + x;
			ch[i] = c;
			ci[i] = color;
		}

		function panel(x: number, y: number, w: number, h: number, heavy: boolean, color: number, block: boolean) {
			// super-thin solid block slabs (no outline)
			if (block) {
				for (let yy = y; yy <= y + h; yy++) for (let xx = x; xx <= x + w; xx++) set(xx, yy, '█', color);

				return;
			}
			// cast a soft shadow down-right onto whatever is behind (depth cue)
			for (let yy = y + 1; yy <= y + h + 1; yy++) set(x + w + 1, yy, '░', 0);
			for (let xx = x + 1; xx <= x + w + 1; xx++) set(xx, y + h + 1, '░', 0);
			// clear the interior so this panel occludes the ones behind it
			for (let yy = y; yy <= y + h; yy++) for (let xx = x; xx <= x + w; xx++) set(xx, yy, ' ', 0);
			// heavy vs light box-drawing border
			const tl = heavy ? '┏' : '┌';
			const tr = heavy ? '┓' : '┐';
			const bl = heavy ? '┗' : '└';
			const br = heavy ? '┛' : '┘';
			const hz = heavy ? '━' : '─';
			const vt = heavy ? '┃' : '│';
			set(x, y, tl, color);
			set(x + w, y, tr, color);
			set(x, y + h, bl, color);
			set(x + w, y + h, br, color);
			for (let xx = x + 1; xx < x + w; xx++) {
				set(xx, y, hz, color);
				set(xx, y + h, hz, color);
			}

			for (let yy = y + 1; yy < y + h; yy++) {
				set(x, yy, vt, color);
				set(x + w, yy, vt, color);
			}
		}

		function render(sm: number, t: number) {
			ch.fill(' ');
			const WOB_R = 11; // wobble influence radius (cells)
			// paint far -> near so nearer panels occlude farther ones
			for (let l = 0; l < LAYERS.length; l++) {
				const L = LAYERS[l];
				const stepx = L.pw + L.gapx;
				const stepy = L.ph + L.gapy;
				// vertical offset driven by (smoothed) scroll -> panels move DOWN
				const oy = (sm / cell) * L.pfac;
				// iterate STABLE world-tile indices (wi, wj) so jitter/stagger never flip
				const jStart = Math.ceil((-stepy - oy) / stepy);
				const jEnd = Math.floor((rows + stepy - oy) / stepy);
				const iEnd = Math.floor((cols + stepx) / stepx) + 1;
				for (let wj = jStart; wj <= jEnd; wj++) {
					const screenY = wj * stepy + oy;
					const stagger = wj & 1 ? stepx / 2 : 0;
					for (let wi = -1; wi <= iEnd; wi++) {
						// deterministic per-tile: scatter some out entirely, jitter the rest
						if (hash2(wi * 131 + l * 17, wj * 197 + l * 53) < L.skip) continue;

						const jx = (hash2(wi * 71 + 5, wj * 37 + l * 11) - 0.5) * L.jit;
						const jy = (hash2(wi * 53 + 9, wj * 89 + l * 23) - 0.5) * L.jit;
						let bx = wi * stepx + stagger + jx;
						let by = screenY + jy;

						// wobble panels near the cursor (proximity-driven, each its own phase)
						if (mPresent > 0.001) {
							const cx = bx + L.pw / 2;
							const cy = by + L.ph / 2;
							const d = Math.hypot((cx - mx) * 0.5, cy - my);
							if (d < WOB_R) {
								const inf = (1 - d / WOB_R) * mPresent;
								const ph2 = hash2(wi * 17 + l, wj * 31 + l) * 6.283;
								bx += Math.sin(t * 5 + ph2) * inf * 2.2;
								by += Math.cos(t * 4.3 + ph2) * inf * 2.2;
							}
						}

						panel(Math.round(bx), Math.round(by), L.pw, L.ph, L.heavy, L.ci, L.block);
					}
				}
			}

			// organic hole under the text: CLEARS the panels (no fill -> no black box)
			// with 1-char padding, framed by a wobbly organic border.
			const mEl = document.querySelector('[data-panel-mask]') as HTMLElement | null;
			if (mEl) {
				const hr = host.getBoundingClientRect();
				const mr = mEl.getBoundingClientRect();
				const a0 = Math.round((mr.left - hr.left) / charW);
				const a1 = Math.round((mr.right - hr.left) / charW);
				const b0 = Math.round((mr.top - hr.top) / cell);
				const b1 = Math.round((mr.bottom - hr.top) / cell);
				const bag = '▓▒░';
				// RADIAL base (ellipse around the content) so there are NO straight edges to
				// fall back to - the noise just wobbles this round "portal" into blobs.
				const cx = (a0 + a1) / 2;
				const cy = (b0 + b1) / 2;
				// snug but not cramped: the rect guard below keeps the text safe
				const rx = ((a1 - a0) / 2) * 1.26 + 4;
				const ry = ((b1 - b0) / 2) * 1.34 + 3;
				const yLo = Math.max(0, Math.floor(cy - ry * 1.6));
				const yHi = Math.min(rows - 1, Math.ceil(cy + ry * 1.6));
				const xLo = Math.max(0, Math.floor(cx - rx * 1.6));
				const xHi = Math.min(cols - 1, Math.ceil(cx + rx * 1.6));
				for (let y = yLo; y <= yHi; y++) {
					for (let x = xLo; x <= xHi; x++) {
						const nx = (x - cx) / rx;
						const ny = (y - cy) / ry;
						const r = Math.hypot(nx, ny); // 1 = ellipse edge, <1 inside
						if (r < 0.78 || (x >= a0 - 1 && x <= a1 + 1 && y >= b0 - 1 && y <= b1 + 1)) {
							set(x, y, ' ', 0); // guaranteed clear -> always covers the text
							continue;
						}
						// the cursor dents the rift membrane: the rim recedes around the
						// pointer (dent shrinks the radius -> hole bulges locally)
						let dent = 0;
						if (mPresent > 0.001) {
							const dcm = Math.hypot((x - mx) * 0.5, y - my);
							if (dcm < 9) {
								const k = 1 - dcm / 9;
								dent = mPresent * k * k * 0.34;
							}
						}
						// wobble the radius with big low-freq noise => blobby portal rim + islands
						const rw = r - dent + (fbm(x * 0.06 + t * 0.12, y * 0.09 - t * 0.09, 2) - 0.5) * 0.62;
						if (rw < 1.0) {
							set(x, y, ' ', 0); // organic interior - CLEARED (no black fill)
						} else if (rw < 1.16) {
							// rim solidifies to ▓ where the cursor is pressing on it
							set(x, y, dent > 0.1 ? '▓' : bag[(hash2(x, y) * bag.length) | 0], 2);
						}
					}
				}

				// bits pinch off the rim as lil blobs that drift outward + shrink away
				if (!reduced) {
					if (t - nextSpawn > 2) {
						nextSpawn = t;
					}
					// no burst after an offscreen pause
					while (t >= nextSpawn) {
						const s = spawnSeed++;
						blobs.push({
							ang: hash2(s, 101) * 6.283,
							born: t,
							spd: 2 + hash2(s, 7) * 2.5,
							life: 1.5 + hash2(s, 13) * 1.5,
							s0: 1.2 + hash2(s, 29) * 1.3
						});

						nextSpawn = t + 0.3 + hash2(s, 41) * 0.5;
						if (blobs.length > 12) {
							blobs.shift();
						}
					}

					for (let bi = blobs.length - 1; bi >= 0; bi--) {
						const b = blobs[bi];
						const age = t - b.born;
						if (age > b.life) {
							blobs.splice(bi, 1);
							continue;
						}

						const size = b.s0 * (1 - age / b.life);
						if (size < 0.3) continue;

						const ca = Math.cos(b.ang);
						const sa = Math.sin(b.ang);
						// outward normal of the rim point, in cell-index space
						const nl = Math.hypot(ca * rx, sa * ry) || 1;
						const px = cx + ca * rx * 1.04 + ((ca * rx) / nl) * age * b.spd * 2;
						const py = cy + sa * ry * 1.04 + ((sa * ry) / nl) * age * b.spd;
						for (let yy = Math.ceil(py - size); yy <= Math.floor(py + size); yy++) {
							for (let xx = Math.ceil(px - size * 2); xx <= Math.floor(px + size * 2); xx++) {
								if (xx >= a0 - 1 && xx <= a1 + 1 && yy >= b0 - 1 && yy <= b1 + 1) continue;

								const dd = Math.hypot((xx - px) * 0.5, yy - py) / size;
								if (dd < 1) {
									set(xx, yy, dd < 0.45 ? '▓' : dd < 0.75 ? '▒' : '░', 2);
								}
							}
						}
					}
				}
			}

			// build run-length coalesced colored spans
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
					const c = ch[i];
					if (c === ' ') {
						out += ' ';
						continue;
					}

					setRun(ci[i] === 2 ? 'c2' : ci[i] === 1 ? 'c1' : '');
					out += c;
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
		let sm = window.scrollY; // smoothed (lerped) scroll position
		const startT = performance.now();

		function frame(now: number) {
			sm += (window.scrollY - sm) * 0.12; // lerp toward real scroll
			// lerp cursor position + presence for the wobble
			if (tmx > -900) {
				if (mx < -900) {
					mx = tmx;
					my = tmy;
				}

				mx += (tmx - mx) * 0.2;
				my += (tmy - my) * 0.2;
			}

			mPresent += (tPresent - mPresent) * 0.1;
			render(sm, (now - startT) / 1000);
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

		// only animate while the section is on-screen
		const io = new IntersectionObserver((entries) => {
			visible = entries[0].isIntersecting;
			if (reduced) {
				if (visible) {
					render(sm, 0);
				}
			} else if (visible) {
				play();
			} else {
				pause();
			}
		});

		io.observe(host);

		function onScrollStatic() {
			sm = window.scrollY;
			if (visible) {
				render(sm, 0);
			}
		}

		if (reduced) {
			window.addEventListener('scroll', onScrollStatic, { passive: true });
		}

		return () => {
			pause();
			ro.disconnect();
			io.disconnect();
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('scroll', onScrollStatic);
		};
	});
</script>

<div class="panels" bind:this={host} aria-hidden="true" style="--fs:{cell}px">
	<pre bind:this={pre}></pre>
</div>

<style>
	.panels {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}

	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--fs);
		line-height: var(--fs);
		color: var(--dim);
		white-space: pre;
		user-select: none;

		/* depth via brightness: far = dim (default), mid lighter, near = accent */
		:global(.c1) {
			color: color-mix(in srgb, var(--text) 45%, var(--dim));
		}

		:global(.c2) {
			color: var(--accent);
		}
	}
</style>
