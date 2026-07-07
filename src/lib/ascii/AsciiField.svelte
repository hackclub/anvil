<script lang="ts">
	import { onMount } from 'svelte';
	import { effects, type EffectCtx } from './effects';
	import { hash2, fbm } from './noise';
	import { cfg } from './config.svelte';
	import { measureCharWidth } from './measureChar';
	import { theme } from '$lib/theme.svelte';

	const RAMP = ' .·:-=+*o▒▓█';
	const GLYPHS = '!<>-_\\/[]{}=+*^?#';
	const SPARKS = "*+·.'`";

	const DIV_RAMP = ' .·:-=+*▒▓█';
	function dividerCell(
		x: number,
		ly: number,
		brows: number,
		tt: number,
		label: string,
		cols: number
	): { ch: string; ci: number } | null {
		if (label) {
			const midRow = Math.floor((brows - 1) / 2);
			const lx0 = Math.floor((cols - label.length) / 2);
			const padX = 3;
			const padY = 1;
			if (ly >= midRow - padY && ly <= midRow + padY && x >= lx0 - padX && x < lx0 + label.length + padX) {
				if (ly === midRow && x >= lx0 && x < lx0 + label.length) {
					const lch = label[x - lx0];
					if (lch !== ' ') return { ch: lch, ci: 2 };
				}

				return { ch: ' ', ci: -1 }; // blank area around the notice
			}
		}

		const mid = (brows - 1) / 2;
		const wob = (fbm(x * 0.07 + 5, tt * 0.35, 3) - 0.5) * brows * 0.8 + Math.sin(x * 0.08 + tt * 0.9) * (brows * 0.12);

		let b = 1 - Math.abs(ly - (mid + wob)) / (brows * 0.5);
		if (b <= 0) return null;

		b *= 0.55 + 0.6 * fbm(x * 0.35 + 2, ly * 0.5 - tt * 0.6, 2);
		let idx = (b * DIV_RAMP.length) | 0;
		if (idx <= 0) return null;

		if (idx >= DIV_RAMP.length) {
			idx = DIV_RAMP.length - 1;
		}

		return { ch: DIV_RAMP[idx], ci: b > 0.72 ? 2 : 0 };
	}

	let host: HTMLDivElement;
	let pre: HTMLPreElement;

	interface Particle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		life: number;
		max: number;
		spark: boolean;
	}

	onMount(() => {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		let cols = 0;
		let rows = 0;
		let charW = 8;
		let charH = cfg.cell;
		let aspect = 0.5;
		let density = new Float32Array(0);
		let sparkGrid = new Uint8Array(0);

		// cursor tracking (cell coords). p* = previous, for path segment + velocity.
		let tmx = -999,
			tmy = -999,
			pmx = -999,
			pmy = -999,
			present = 0,
			suppress = 0; // 1 when cursor is over a [data-no-smoke] zone

		const particles: Particle[] = [];

		function measure() {
			charW = measureCharWidth(cfg.cell, host);
			charH = cfg.cell;
			aspect = charW / charH;
			cols = Math.ceil(window.innerWidth / charW) + 1;
			rows = Math.ceil(window.innerHeight / charH) + 1;
			density = new Float32Array(cols * rows);
			sparkGrid = new Uint8Array(cols * rows);
		}

		function onMove(e: MouseEvent) {
			tmx = e.clientX / charW;
			tmy = e.clientY / charH;
			present = 1;
			suppress = 0;
			const zones = document.querySelectorAll('[data-no-smoke]');
			for (let i = 0; i < zones.length; i++) {
				const r = zones[i].getBoundingClientRect();
				if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
					suppress = 1;
					break;
				}
			}
		}

		function onLeaveWin() {
			present = 0;
		}

		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(document.documentElement);
		window.addEventListener('mousemove', onMove);
		document.addEventListener('mouseleave', onLeaveWin);

		let t = 0;
		let last = performance.now();
		let raf = 0;
		let glitchTimer = 0;
		let glitchRows: number[] = [];

		// rebuilt only when the box's cell dimensions change!
		const CREDIT = 'by @ascpixi for Hack Club with <3';
		let boxKey = '';
		let topEdge = '';
		let botEdge = '';
		let creditLo = -1;
		let creditHi = -1;

		let creditColors: number[] = [];
		function buildEdges(w: number) {
			const inner = Math.max(0, w - 2);
			creditLo = -1;
			creditHi = -1;
			topEdge = '╭' + '─'.repeat(inner) + '╮';

			// credit lives on the BOTTOM edge, right-aligned (2 dashes before the corner)
			const tag = '┤ ' + CREDIT + ' ├';
			let botMid = '─'.repeat(inner);
			if (tag.length <= inner - 4) {
				const start = inner - tag.length - 2;
				botMid = '─'.repeat(start) + tag + '──';
				creditLo = 1 + start;
				creditHi = creditLo + tag.length - 1;

				// gray by default (CI_FRAME=1); highlight key words red (CI_CREDIT=2)
				creditColors = new Array(tag.length).fill(1);
				for (const wd of ['@ascpixi', 'Hack Club', '<3']) {
					let idx = CREDIT.indexOf(wd);
					while (idx >= 0) {
						for (let k = 0; k < wd.length; k++) creditColors[2 + idx + k] = 2;
						idx = CREDIT.indexOf(wd, idx + wd.length);
					}
				}
			}

			botEdge = '╰' + botMid + '╯';
		}

		// ── particle system ──────────────────────────────────────────────────
		const rnd = () => Math.random() * 2 - 1;

		function spawn(x: number, y: number, vx: number, vy: number, spark: boolean) {
			if (particles.length >= cfg.cap) return;

			const max = spark ? 1.4 + Math.random() * 0.8 : 1.1 + Math.random() * 1.0;
			particles.push({ x, y, vx, vy, life: max, max, spark });
		}

		function emit(dt: number) {
			if (pmx < -900) {
				pmx = tmx;
				pmy = tmy;
			}

			const dxm = tmx - pmx;
			const dym = tmy - pmy;
			const dist = Math.hypot(dxm, dym);

			// stretches along the path we swipe
			const cvx = dxm / Math.max(dt, 0.001);
			const cvy = dym / Math.max(dt, 0.001);
			const INHERIT = cfg.inherit;
			const SPREAD = cfg.spread;
			const CLUSTER = cfg.cluster;
			const SPARK = cfg.sparkChance;

			// lay particles ALONG the path segment so fast swipes stay continuous
			const steps = Math.min(28, Math.max(1, Math.floor(dist / 0.6)));
			for (let s = 0; s < steps; s++) {
				const tt = steps > 1 ? s / (steps - 1) : 1;
				const ex = pmx + dxm * tt;
				const ey = pmy + dym * tt;

				// smoke - a small cluster per step for a fuller, bigger ball
				for (let c = 0; c < CLUSTER; c++) {
					spawn(
						ex + rnd() * SPREAD,
						ey + rnd() * SPREAD,
						cvx * INHERIT + rnd() * 2.4,
						cvy * INHERIT + rnd() * 2.4 - 1.2,
						false
					);
				}

				// sparks shed off the ball, flying outward
				if (Math.random() < SPARK) {
					const ang = Math.random() * Math.PI * 2;
					const spd = 6 + Math.random() * 10;
					spawn(ex, ey, cvx * 0.4 + Math.cos(ang) * spd, cvy * 0.4 + Math.sin(ang) * spd, true);
				}
			}

			pmx = tmx;
			pmy = tmy;
		}

		function updateParticles(dt: number) {
			const BUOY = cfg.buoy;
			const SWIRL = cfg.swirl;
			const DRAG = cfg.drag;
			let w = 0;
			for (let i = 0; i < particles.length; i++) {
				const p = particles[i];
				const a = fbm(p.x * 0.09 + 7, p.y * 0.09 - t * 0.25, 2) * 6.28318;
				const swirl = p.spark ? SWIRL * 0.4 : SWIRL;
				const buoy = p.spark ? BUOY * 0.4 : BUOY;
				const drag = p.spark ? DRAG * 0.5 : DRAG;
				p.vx += Math.cos(a) * swirl * dt;
				p.vy += Math.sin(a) * swirl * dt - buoy * dt;
				p.vx -= p.vx * drag * dt;
				p.vy -= p.vy * drag * dt;
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				p.life -= dt;

				if (p.life > 0 && p.y > -3 && p.x > -3 && p.x < cols + 3) {
					particles[w++] = p;
				}
			}

			particles.length = w;
		}

		function splat() {
			density.fill(0);
			sparkGrid.fill(0);
			const PSTR = cfg.pstr;
			for (let i = 0; i < particles.length; i++) {
				const p = particles[i];
				const inten = p.life / p.max;
				const wgt = inten * (p.spark ? 2.4 : 1.0) * PSTR;
				const ix = Math.floor(p.x);
				const iy = Math.floor(p.y);
				const fx = p.x - ix;
				const fy = p.y - iy;
				addD(ix, iy, (1 - fx) * (1 - fy) * wgt);
				addD(ix + 1, iy, fx * (1 - fy) * wgt);
				addD(ix, iy + 1, (1 - fx) * fy * wgt);
				addD(ix + 1, iy + 1, fx * fy * wgt);
				const h = wgt * 0.3;
				addD(ix - 1, iy, h);
				addD(ix + 2, iy, h);
				addD(ix, iy - 1, h);
				addD(ix, iy + 2, h);

				// diagonal + wider halo for a softer, bigger blob
				const h2 = wgt * 0.16;
				addD(ix - 1, iy - 1, h2);
				addD(ix + 2, iy - 1, h2);
				addD(ix - 1, iy + 2, h2);
				addD(ix + 2, iy + 2, h2);
				
				if (p.spark && ix >= 0 && ix < cols && iy >= 0 && iy < rows) {
					sparkGrid[iy * cols + ix] = 1;
				}
			}
		}

		function addD(cx: number, cy: number, val: number) {
			if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;

			density[cy * cols + cx] += val;
		}

		// structural colors only (field itself is a single flat color)
		const CI_FIELD = 0;
		const CI_FRAME = 1;
		const CI_CREDIT = 2;
		const colorLUT: string[] = ['#888888', '#888888', '#888888'];
		function esc(s: string): string {
			return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
		}

		function buildColorLUT() {
			colorLUT[CI_FIELD] = theme.current.dim;
			colorLUT[CI_FRAME] = theme.current.frame ?? theme.current.text;
			colorLUT[CI_CREDIT] = theme.current.accent;
		}

		function render() {
			// --- scroll-driven crossfade between shaders --------------------
			const max = document.documentElement.scrollHeight - window.innerHeight;
			const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
			const pos = p * (effects.length - 1);
			let ei = Math.floor(pos);
			if (ei >= effects.length - 1) {
				ei = effects.length - 2 >= 0 ? effects.length - 2 : 0;
			}

			const f = pos - ei;
			const effA = effects[ei];
			const effB = effects[Math.min(ei + 1, effects.length - 1)];
			const ctx: EffectCtx = { t, cols, rows, aspect };

			// --- grid-aligned box around the hero card (tracks it on scroll) --
			let bx0 = 1,
				by0 = 1,
				bx1 = -1,
				by1 = -1;

			const voidEl = document.querySelector('[data-ascii-void]') as HTMLElement | null;
			if (voidEl) {
				const r = voidEl.getBoundingClientRect();
				if (r.bottom > -40 && r.top < window.innerHeight + 40 && r.width > 0) {
					bx0 = Math.round(r.left / charW);
					bx1 = Math.round(r.right / charW);
					by0 = Math.round(r.top / charH);
					by1 = Math.round(r.bottom / charH);
				}
			}

			const hasBox = bx1 > bx0;
			if (hasBox) {
				const key = bx1 - bx0 + 'x' + (by1 - by0);
				if (key !== boxKey) {
					boxKey = key;
					buildEdges(bx1 - bx0 + 1);
				}
			}

			splat();
			buildColorLUT();

			const active = cfg.glitch && glitchRows.length > 0;
			const rampMax = RAMP.length;
			const DENSITY = cfg.density;

			// sections carve "caves" into the field (rects in cell coords).
			// default = soft organic clearing; data-ascii-cave="grid" = a hard
			// cell-snapped chamber with undulating whole-cell walls + rubble edge.
			const caveRects: { x0: number; y0: number; x1: number; y1: number; grid: boolean }[] = [];
			document.querySelectorAll('[data-ascii-cave]').forEach((el) => {
				const r = el.getBoundingClientRect();
				if (r.bottom > -120 && r.top < window.innerHeight + 120 && r.width > 0) {
					caveRects.push({
						x0: Math.round(r.left / charW) - 1,
						y0: Math.round(r.top / charH) - 1,
						x1: Math.round(r.right / charW) + 1,
						y1: Math.round(r.bottom / charH) + 1,
						grid: el.getAttribute('data-ascii-cave') === 'grid'
					});
				}
			});

			const CAVE_EDGE = 4;

			// separating curves: bands of rows where a divider draws over everything
			const bands: { y0: number; brows: number; label: string }[] = [];
			document.querySelectorAll('[data-divider]').forEach((el) => {
				const r = el.getBoundingClientRect();
				if (r.bottom < -20 || r.top > window.innerHeight + 20) return;

				bands.push({
					y0: Math.round(r.top / charH),
					brows: Math.max(1, Math.round((r.bottom - r.top) / charH)),
					label: el.getAttribute('data-divider-label') || ''
				});
			});

			// run-length coalesced colored spans
			const parts: string[] = [];
			let buf = '';
			let curCi = 0;
			const flush = () => {
				if (buf) {
					parts.push('<span style="color:' + colorLUT[curCi] + '">' + esc(buf) + '</span>');
					buf = '';
				}
			};

			// ci < 0 => "no ink" (space/newline): merge into the current run
			const push = (ch: string, ci: number) => {
				if (ci < 0 || ci === curCi) {
					buf += ch;
				} else {
					flush();
					curCi = ci;
					buf = ch;
				}
			};

			for (let y = 0; y < rows; y++) {
				const glitched = active && glitchRows.includes(y);
				const ay = y * aspect;
				const rowBase = y * cols;
				for (let x = 0; x < cols; x++) {
					// separating curves overwrite everything (drawn on the same grid)
					if (bands.length) {
						let dcell: { ch: string; ci: number } | null = null;
						for (let bi = 0; bi < bands.length; bi++) {
							const bd = bands[bi];
							if (y >= bd.y0 && y < bd.y0 + bd.brows) {
								dcell = dividerCell(x, y - bd.y0, bd.brows, t, bd.label, cols);
								if (dcell) break;
							}
						}

						if (dcell) {
							push(dcell.ch, dcell.ci);
							continue;
						}
					}

					let amb = (effA(x, ay, ctx) * (1 - f) + effB(x, ay, ctx) * f) * DENSITY;
					let smoke = 1;

					// carve section caves out of the ambient field. soft caves fade
					// through an organic edge; grid caves blank a cell-snapped chamber
					// whose walls jut outward in whole-cell jagged steps
					if (caveRects.length) {
						let caveF = 1;
						let smokeF = 1; // cursor smoke dies off with depth into a chamber
						let wallD = 0; // 1 = inner rubble ring, 2 = crumbly outer ring
						let wox = 0; // cell coords relative to the owning chamber, so the
						let woy = 0; // jag/rubble pattern travels with its section on scroll
						for (let c = 0; c < caveRects.length; c++) {
							const cr = caveRects[c];
							if (cr.grid) {
								// fast reject: beyond max swell + rubble band
								if (x < cr.x0 - 19 || x > cr.x1 + 19 || y < cr.y0 - 12 || y > cr.y1 + 12) continue;

								const dxo = Math.max(Math.max(cr.x0 - x, x - cr.x1), 0);
								const dyo = Math.max(Math.max(cr.y0 - y, y - cr.y1), 0);
								// blobby rift outline: SIGNED rounded-rect distance (rows
								// aspect-scaled ×1.7; negative = depth inside the rect) minus a
								// slow drifting low-freq swell. thresholded per integer cell, so
								// the organic boundary still steps on the grid.
								const rd =
									dxo === 0 && dyo === 0
										? Math.max(Math.max(cr.x0 - x, x - cr.x1), Math.max(cr.y0 - y, y - cr.y1) * 1.7)
										: Math.hypot(dxo, dyo * 1.7);

								const sw = fbm((x - cr.x0) * 0.045, (y - cr.y0) * 0.08 - t * 0.3, 2) * 18 - 2;
								const d = rd - sw;
								if (d <= 0) {
									caveF = 0;
									wallD = 0;
									// smoke may curl a little past the mouth (d≈0), then fades
									// to nothing as it reaches the content
									const sf = 1 + d / 6;
									smokeF = sf > 0 ? sf * sf : 0;
									break;
								}

								if (d <= 2 && (wallD === 0 || d < wallD)) {
									wallD = d <= 1 ? 1 : 2;
									wox = x - cr.x0;
									woy = y - cr.y0;
								}

								continue;
							}

							let d = Math.max(Math.max(cr.x0 - x, x - cr.x1), Math.max(cr.y0 - y, y - cr.y1));
							d += (fbm(x * 0.2 + 3, y * 0.2 - t * 0.3, 2) - 0.5) * 3; // organic wobble
							if (d < 0) {
								caveF = 0;
								break;
							}

							if (d < CAVE_EDGE) {
								const k = d / CAVE_EDGE;
								if (k * k < caveF) {
									caveF = k * k;
								}
							}
						}

						if (wallD) {
							const h = hash2(wox * 5 + 1, woy * 7 + 3);
							if (wallD === 1) {
								push(h > 0.5 ? '▓' : '▒', CI_FIELD);
								continue;
							}

							if (h > 0.55) {
								push(h > 0.82 ? '▒' : '░', CI_FIELD);
								continue;
							}
						}

						amb *= caveF;
						smoke = smokeF;
					}

					let v = amb + density[rowBase + x] * smoke;

					// grid-aligned box + organic flame boundary + glitchy collisions
					if (hasBox) {
						const dist = Math.max(Math.max(bx0 - x, x - bx1), Math.max(by0 - y, y - by1));
						const FRINGE = 5;
						if (dist < FRINGE + 6) {
							const cy2 = (by0 + by1) / 2;
							const flame = (fbm(x * 0.16 + 40, y * 0.16 - t * 1.1, 3) - 0.5) * 6.0;
							const above = y < cy2 ? 1.5 : 0.7;
							const wd = dist + flame * above + (hash2(x, y + ((t * 8) | 0)) - 0.5) * 1.3;
							const onBorder = dist === 0;
							const inside = dist < 0;
							const isCredit = onBorder && y === by1 && x - bx0 >= creditLo && x - bx0 <= creditHi;
							const invaded = wd > 0 && !isCredit;

							if (inside && !invaded) {
								if (!(glitched && hash2(x * 5, y * 3) > 0.82)) {
									push(' ', -1);
									continue;
								}

								v *= 0.5;
							} else if (onBorder && !invaded) {
								const gth = isCredit ? 0.995 : 0.7;
								if (!(glitched && hash2(x * 7, y) > gth)) {
									const ch = y === by0 ? topEdge[x - bx0] : y === by1 ? botEdge[x - bx0] : '│';
									const cci = isCredit ? (creditColors[x - bx0 - creditLo] ?? CI_FRAME) : CI_FRAME;
									push(ch ?? '│', cci);
									continue;
								}
							} else if (dist > 0 && wd < FRINGE) {
								const k = Math.max(0, wd) / FRINGE;
								v *= k * k;
							}
						}
					}

					let idx = (v * rampMax) | 0;
					if (idx < 0) {
						idx = 0;
					} else if (idx >= rampMax) {
						idx = rampMax - 1;
					}

					let ch = RAMP[idx];
					let ci = ch === ' ' ? -1 : CI_FIELD;
					if (sparkGrid[rowBase + x] && v > 0.12) {
						ch = SPARKS[(hash2(x, y + ((t * 12) | 0)) * SPARKS.length) | 0];
						ci = CI_CREDIT;
					} else if (glitched && ch !== ' ' && hash2(x, y) > 0.45) {
						ch = GLYPHS[(hash2(x * 3, y * 7) * GLYPHS.length) | 0];
					}

					push(ch, ci);
				}

				push('\n', -1);
			}

			flush();
			pre.innerHTML = parts.join('');
		}

		function frame(now: number) {
			const dt = Math.min(50, now - last) / 1000;
			last = now;
			t += dt;

			// re-measure if the grid size was changed from the tinker panel
			if (cfg.cell !== charH) {
				measure();
			}

			if (present && !suppress && tmx > -900) {
				emit(dt);
			} else {
				pmx = tmx;
				pmy = tmy;
			}

			updateParticles(dt);

			if (cfg.glitch) {
				glitchTimer -= dt;
				if (glitchTimer <= 0) {
					glitchTimer = 0.25 + hash2((t * 100) | 0, 7) * 1.4;
					glitchRows = [];
					const n = 1 + ((hash2((t * 70) | 0, 3) * 3) | 0);
					for (let k = 0; k < n; k++) glitchRows.push((hash2(((t * 50) | 0) + k, k) * rows) | 0);
				}
			}

			render();
			raf = requestAnimationFrame(frame);
		}

		if (reduced) {
			t = 12.3;
			render();
			window.addEventListener('scroll', render, { passive: true });
		} else {
			raf = requestAnimationFrame(frame);
		}

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			window.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseleave', onLeaveWin);
			window.removeEventListener('scroll', render);
		};
	});
</script>

<div class="ascii-host" bind:this={host} aria-hidden="true">
	<pre bind:this={pre} style="--fs:{cfg.cell}px"></pre>
</div>

<style>
	.ascii-host {
		position: fixed;
		inset: 0;
		overflow: hidden;
		z-index: 0;
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
		will-change: contents;
	}
</style>
