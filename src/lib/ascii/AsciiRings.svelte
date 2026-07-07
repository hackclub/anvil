<script lang="ts">
	import { onMount } from 'svelte';
	import { fbm } from './noise';
	import { forgeWindow } from './forgeWindow.svelte';
	import { measureCharWidth } from './measureChar';

	interface Props {
		cell?: number;
		/** vertical center of the rings as a fraction of height */
		centerYFrac?: number;
	}

	let { cell = 16, centerYFrac = 0.5 }: Props = $props();

	let host: HTMLDivElement;
	let pre: HTMLPreElement;

	const RAMP = ' .·:-=+*o▒▓';

	onMount(() => {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		let cols = 0;
		let rows = 0;
		let charW = 8;

		function measure() {
			charW = measureCharWidth(cell, host);
			const r = host.getBoundingClientRect();
			cols = Math.max(1, Math.ceil(r.width / charW) + 1);
			rows = Math.max(1, Math.ceil(r.height / cell) + 1);
		}

		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(host);

		// smoothed ring center - tracks the draggable forge window (same origin +
		// cell size), falling back to centerYFrac before the window publishes.
		let scx = -1;
		let scy = -1;

		// the cursor is a SECOND wave source: its ripples superpose with the
		// forge rings, so crests brighten and troughs cancel where they cross
		// (real interference, not a glow). clicks drop an expanding shockwave.
		let mx = 0;
		let my = 0;
		let mIn = false;
		let mp = 0; // smoothed presence so the ripples fade in/out
		let tCur = 0;
		const pulses: { x: number; y: number; t0: number }[] = [];

		function toCells(e: { clientX: number; clientY: number }) {
			const r = host.getBoundingClientRect();
			return {
				x: (e.clientX - r.left) / charW,
				y: (e.clientY - r.top) / cell,
				inside: e.clientY >= r.top && e.clientY <= r.bottom && e.clientX >= r.left && e.clientX <= r.right
			};
		}

		function onMove(e: MouseEvent) {
			const p = toCells(e);
			mx = p.x;
			my = p.y;
			mIn = p.inside;
		}

		function onLeave() {
			mIn = false;
		}

		function onDown(e: PointerEvent) {
			const p = toCells(e);
			if (!p.inside) return;

			if (pulses.length >= 6) {
				pulses.shift();
			}

			pulses.push({ x: p.x, y: p.y, t0: tCur });
		}

		function render(t: number) {
			tCur = t;
			mp += ((mIn ? 1 : 0) - mp) * 0.08;
			while (pulses.length && t - pulses[0].t0 > 3.5) pulses.shift();
			const tcx = forgeWindow.active ? forgeWindow.cx : cols / 2;
			const tcy = forgeWindow.active ? forgeWindow.cy : rows * centerYFrac;
			if (scx < 0) {
				scx = tcx;
				scy = tcy;
			} else {
				scx += (tcx - scx) * 0.15;
				scy += (tcy - scy) * 0.15;
			}

			const cx = scx;
			const cy = scy;
			const rampMax = RAMP.length;
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
					const dx = (x - cx) * 0.5; // aspect-correct so rings look round
					const dy = y - cy;
					let d = Math.hypot(dx, dy);
					const ang = Math.atan2(dy, dx);
					// organic wobble: perturb the radius by angular + drifting radial noise
					d += (fbm(Math.cos(ang) * 1.8 + 5, Math.sin(ang) * 1.8 - t * 0.15, 2) - 0.5) * 5;
					d += (fbm(x * 0.05, y * 0.07 + t * 0.1, 2) - 0.5) * 3;
					// expanding concentric rings
					let s = Math.sin(d * 0.5 - t * 2.2);
					// cursor ripples: constructive only - a gentle traveling crest that
					// BRIGHTENS the rings it passes over, never cancels them
					if (mp > 0.01) {
						const dc = Math.hypot((x - mx) * 0.5, y - my);
						const k = mp * Math.exp(-dc * 0.09);
						if (k > 0.02) {
							s += k * 0.35 * (Math.sin(dc * 0.75 - t * 3.2) + 1);
						}
					}
					// click shockwaves: a soft wave packet expanding from each click
					for (let pi = 0; pi < pulses.length; pi++) {
						const pu = pulses[pi];
						const age = t - pu.t0;
						const dp = Math.hypot((x - pu.x) * 0.5, y - pu.y) - age * 16;
						if (dp < 5 && dp > -5) {
							s += Math.exp(-dp * dp * 0.2) * Math.exp(-age * 1.1) * 1.3;
						}
					}

					let ring = s * 0.5 + 0.5;
					if (ring < 0) {
						ring = 0;
					} else if (ring > 1) {
						ring = 1;
					}

					const v = ring * ring * ring; // sharpen into thin bright ring lines
					let idx = (v * rampMax) | 0;
					if (idx <= 0) {
						out += ' ';
						continue;
					}

					if (idx >= rampMax) {
						idx = rampMax - 1;
					}

					setRun(v > 0.72 ? 'c2' : v > 0.4 ? 'c1' : '');
					out += RAMP[idx];
				}

				out += '\n';
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
			if (reduced) {
				if (e[0].isIntersecting) {
					render(3);
				}
			} else if (e[0].isIntersecting) {
				play();
			} else {
				pause();
			}
		});

		io.observe(host);

		if (!reduced) {
			window.addEventListener('mousemove', onMove);
			window.addEventListener('pointerdown', onDown);
			document.addEventListener('mouseleave', onLeave);
		}

		return () => {
			pause();
			ro.disconnect();
			io.disconnect();
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('pointerdown', onDown);
			document.removeEventListener('mouseleave', onLeave);
		};
	});
</script>

<div class="rings" bind:this={host} aria-hidden="true" style="--fs:{cell}px">
	<pre bind:this={pre}></pre>
</div>

<style>
	.rings {
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

		:global(.c1) {
			color: color-mix(in srgb, var(--text) 45%, var(--dim));
		}

		:global(.c2) {
			color: var(--accent);
		}
	}
</style>
