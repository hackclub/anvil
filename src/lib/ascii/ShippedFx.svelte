<script lang="ts">
	import { onMount } from 'svelte';
	import { hash2 } from './noise';
	import { measureCharWidth } from './measureChar';

	let { rows = 16, cell = 16 }: { rows?: number; cell?: number } = $props();

	const IMPACT_MS = 500;

	let host: HTMLDivElement;
	let pre: HTMLPreElement;

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

		// deterministic particle set (seeded by index, not Math.random - stable
		// across resizes and replays)
		const N = 90;
		const particles = Array.from({ length: N }, (_, i) => {
			const a = hash2(i, 1) * Math.PI * 2;
			return {
				angle: a,
				speed: 8 + hash2(i, 2) * 26, // cells/sec outward after impact
				drag: 1.4 + hash2(i, 3) * 1.4,
				glyph: "✶*+·'"[Math.min(4, (hash2(i, 4) * 5) | 0)],
				spin: (hash2(i, 5) - 0.5) * 3
			};
		});

		const RAMP = ' ·:-=+*#';

		function render(tms: number) {
			const cx = cols / 2;
			const cy = (rows - 1) / 2;
			const maxR = Math.hypot(cx, cy * 2.2);

			// screen shake right after impact, decaying fast
			let sx = 0;
			let sy = 0;
			const sinceHit = tms - IMPACT_MS;
			if (sinceHit > 0 && sinceHit < 450) {
				const k = 1 - sinceHit / 450;
				sx = Math.round((hash2((tms / 30) | 0, 7) - 0.5) * 3 * k);
				sy = Math.round((hash2((tms / 30) | 0, 11) - 0.5) * 2 * k);
			}

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

			// paint into a cell buffer first (particles overwrite the field)
			const buf: { ch: string; cls: string }[][] = Array.from({ length: rows }, () =>
				Array.from({ length: cols }, () => ({ ch: ' ', cls: '' }))
			);

			const put = (x: number, y: number, ch: string, cls: string) => {
				const xi = Math.round(x + sx);
				const yi = Math.round(y + sy);
				if (yi >= 0 && yi < rows && xi >= 0 && xi < cols) {
					buf[yi][xi] = { ch, cls };
				}
			};

			if (tms < IMPACT_MS) {
				// ── contract: everything rushes INTO the center (ease-in) ──
				const p = tms / IMPACT_MS;
				const ease = p * p * p;
				for (const pt of particles) {
					const a = pt.angle + pt.spin * p * 0.4;
					const r = maxR * 0.9 * (1 - ease) * (0.35 + hash2(pt.speed, 1) * 0.65);
					const x = cx + Math.cos(a) * r;
					const y = cy + (Math.sin(a) * r) / 2.2;
					put(x, y, p > 0.75 ? '*' : p > 0.4 ? '+' : '·', p > 0.6 ? 'c2' : 'c1');
				}
				// shrinking ring closing on the center
				const rr = maxR * 0.45 * (1 - ease);
				for (let a = 0; a < Math.PI * 2; a += 0.12) {
					put(cx + Math.cos(a) * rr, cy + (Math.sin(a) * rr) / 2.2, '▓', p > 0.7 ? 'c2' : '');
				}
			} else {
				const t = sinceHit / 1000; // seconds since impact

				// flash: the first ~90ms blows the whole center out
				if (sinceHit < 90) {
					for (let y = 0; y < rows; y++) {
						for (let x = 0; x < cols; x++) {
							const d = Math.hypot(x - cx, (y - cy) * 2.2);
							if (d < maxR * 0.5) {
								buf[y][x] = { ch: '█', cls: 'c2' };
							} else if (d < maxR * 0.8) {
								buf[y][x] = { ch: '▓', cls: 'c1' };
							}
						}
					}
				} else {
					// two expanding shockwave rings (fast + trailing), fading out
					const w1 = maxR * (1 - Math.exp(-t * 2.6));
					const w2 = maxR * (1 - Math.exp(-t * 1.4)) * 0.6;
					const fade = Math.max(0, 1 - t / 2.2);
					for (let y = 0; y < rows; y++) {
						for (let x = 0; x < cols; x++) {
							const d = Math.hypot(x - cx, (y - cy) * 2.2);
							let v = Math.exp(-Math.abs(d - w1) * 0.55) * fade;
							v = Math.max(v, Math.exp(-Math.abs(d - w2) * 0.8) * fade * 0.7);
							// per-cell jitter keeps the rings crumbly, not perfect
							v *= 0.65 + hash2(x * 3, y * 5) * 0.6;
							const idx = (v * RAMP.length) | 0;
							if (idx > 0) {
								buf[y][x] = {
									ch: RAMP[Math.min(idx, RAMP.length - 1)],
									cls: v > 0.55 ? 'c2' : v > 0.3 ? 'c1' : ''
								};
							}
						}
					}
					// sparks flying outward, slowing down and burning out
					for (const pt of particles) {
						const life = 0.9 + hash2(pt.speed, 9) * 1.4;
						if (t > life) continue;

						const dist = (pt.speed / pt.drag) * (1 - Math.exp(-pt.drag * t));
						const a = pt.angle + pt.spin * t * 0.25;
						const x = cx + Math.cos(a) * dist;
						const y = cy + (Math.sin(a) * dist) / 2.2;
						const dying = t / life;
						put(x, y, dying > 0.75 ? '·' : pt.glyph, dying > 0.6 ? 'c1' : 'c2');
					}
				}
			}

			for (let y = 0; y < rows; y++) {
				for (const c of buf[y]) {
					setRun(c.cls);
					out += c.ch === '✶' ? '<span class="spark">✶</span>' : c.ch;
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
		const start = performance.now();
		function frame(now: number) {
			render(now - start);
			raf = requestAnimationFrame(frame);
		}

		if (reduced) {
			render(IMPACT_MS + 2600); // settled end state
		} else {
			raf = requestAnimationFrame(frame);
		}

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	});
</script>

<div class="fx" bind:this={host} style="--rows: {rows}; --fs: {cell}px" aria-hidden="true">
	<pre bind:this={pre}></pre>
</div>

<style>
	.fx {
		height: calc(var(--rows) * var(--fs));
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

		:global(.c1) {
			color: color-mix(in srgb, var(--text) 55%, var(--dim));
		}

		:global(.c2) {
			color: var(--accent);
		}
	}
</style>
