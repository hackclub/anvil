<script lang="ts">
	// An ASCII marquee of real shop items for the homepage: box-drawing cards
	// with the item's thumbnail overlaid in an image well, scrolling one
	// CHARACTER per tick (deliberately not smooth - it's a terminal). Items
	// hydrate from /api/shop so the page stays prerendered. Thumbnails ride
	// the marquee as absolutely-positioned <img>s and are CLIPPED by the
	// host at the edges, so cards get cut off instead of popping. Configurable
	// direction/phase/speed so two instances can overlap without syncing.
	import { onMount } from 'svelte';
	import { measureCharWidth } from './measureChar';

	interface Item {
		name: string;
		price: number;
		thumbnailUrl: string | null;
	}

	interface Cell {
		ch: string;
		cls: string;
	}

	interface CardMeta {
		startX: number;
		w: number;
		url: string | null;
	}

	interface Props {
		cell?: number;
		/** scroll direction: 1 = left, -1 = right */
		dir?: 1 | -1;
		/** initial position as a fraction of the strip (desyncs instances) */
		phase?: number;
		/** ms per one-character step */
		tick?: number;
	}

	let { cell = 16, dir = 1, phase = 0, tick = 110 }: Props = $props();

	const CARD_W = 24; // total card width incl. borders
	const IMG_ROWS = 6; // interior rows the thumbnail covers
	// border + breather + image + breather + name + price + border
	const ROWS = IMG_ROWS + 6;
	const IMG_TOP = 2; // grid row the image starts on
	const GAP = 2;
	const LH = 1.25;

	let host = $state<HTMLDivElement>();
	let pre = $state<HTMLPreElement>();
	let items = $state<Item[]>([]);
	let cols = $state(60);
	let charW = $state(9.6);
	let offset = $state(0);
	let seeded = $state(false);

	// the endless strip: ROWS row-arrays of cells + per-card metadata
	const built = $derived.by((): { rows: Cell[][]; cards: CardMeta[] } => {
		const rows: Cell[][] = Array.from({ length: ROWS }, () => []);
		const cards: CardMeta[] = [];
		const s = (str: string, cls = ''): Cell[] => [...str].map((ch) => ({ ch, cls }));
		const inner = CARD_W - 2;
		for (const it of items) {
			const startX = rows[0].length;
			cards.push({ startX, w: CARD_W, url: it.thumbnailUrl });
			const name = it.name.length > inner - 2 ? it.name.slice(0, inner - 3).trimEnd() + '…' : it.name;

			const blankInterior = () => [
				{ ch: '│', cls: '' },
				...s(' '.repeat(inner)),
				{ ch: '│', cls: '' },
				...s(' '.repeat(GAP))
			];

			rows[0].push(...s(`╭${'─'.repeat(inner)}╮${' '.repeat(GAP)}`));
			rows[1].push(...blankInterior()); // breather before the image
			for (let r = IMG_TOP; r < IMG_TOP + IMG_ROWS; r++) {
				rows[r].push(...blankInterior());
			}

			rows[IMG_TOP + IMG_ROWS].push(...blankInterior()); // breather before the name
			rows[IMG_TOP + IMG_ROWS + 1].push(
				{ ch: '│', cls: '' },
				...s(` ${name}`.padEnd(inner), 'c3'),
				{ ch: '│', cls: '' },
				...s(' '.repeat(GAP))
			);

			rows[IMG_TOP + IMG_ROWS + 2].push(
				{ ch: '│', cls: '' },
				...s(` ${Math.round(it.price)} ✶`.padEnd(inner), 'c2'),
				{ ch: '│', cls: '' },
				...s(' '.repeat(GAP))
			);

			rows[IMG_TOP + IMG_ROWS + 3].push(...s(`╰${'─'.repeat(inner)}╯${' '.repeat(GAP)}`));
		}

		return { rows, cards };
	});

	// start at the requested phase once the strip exists
	$effect(() => {
		const L = built.rows[0].length;
		if (!seeded && L > 0) {
			offset = Math.floor(L * phase) % L;
			seeded = true;
		}
	});

	// thumbnails for every card instance with ANY part on screen - the host's
	// overflow clipping cuts them off at the edges, in step with the chars
	const visibleImgs = $derived.by(() => {
		const L = built.rows[0].length;
		if (L === 0) return [];

		const out: { key: string; px: number; url: string }[] = [];
		for (const c of built.cards) {
			if (!c.url) continue;

			const sx = (((c.startX - offset) % L) + L) % L;
			// the same card can peek from the right edge and the left edge at
			// once (wrap seam) - consider both positions
			for (const p of [sx, sx - L]) {
				if (p > -c.w && p < cols) {
					out.push({ key: `${c.startX}:${p === sx ? 0 : 1}`, px: p, url: c.url });
				}
			}
		}

		return out;
	});

	// paint the visible window with modular wrap - char-per-char movement
	$effect(() => {
		if (!pre) return;

		const L = built.rows[0].length;
		if (L === 0) {
			pre.innerHTML = '';
			return;
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

		for (let r = 0; r < ROWS; r++) {
			for (let x = 0; x < cols; x++) {
				const c = built.rows[r][(offset + x) % L];
				setRun(c.cls);
				out +=
					c.ch === '<'
						? '&lt;'
						: c.ch === '>'
							? '&gt;'
							: c.ch === '&'
								? '&amp;'
								: c.ch === '✶'
									? '<span class="spark">✶</span>'
									: c.ch;
			}

			if (r < ROWS - 1) {
				out += '\n';
			}
		}

		if (cur) {
			out += '</span>';
		}

		pre.innerHTML = out;
	});

	onMount(() => {
		fetch('/api/shop')
			.then((r) => (r.ok ? r.json() : []))
			.then((data: Item[]) => (items = data))
			.catch(() => {});

		function measure() {
			if (!host) return;

			charW = measureCharWidth(cell, host);
			cols = Math.max(CARD_W, Math.floor(host.getBoundingClientRect().width / charW));
		}

		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(host!);

		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		let iv = 0;
		if (!reduced) {
			iv = window.setInterval(() => {
				const L = built.rows[0].length;
				if (L > 0) {
					offset = (offset + dir + L) % L;
				}
			}, tick);
		}

		return () => {
			ro.disconnect();
			clearInterval(iv);
		};
	});
</script>

<div class="carousel" bind:this={host} style="--fs: {cell}px" aria-hidden="true">
	{#if items.length > 0}
		<pre bind:this={pre}></pre>
		{#each visibleImgs as img (img.key)}
			<img
				src={img.url}
				alt=""
				loading="lazy"
				style={`left:${(img.px + 2) * charW}px;top:${IMG_TOP * cell * LH}px;width:${(CARD_W - 4) * charW}px;height:${IMG_ROWS * cell * LH}px`}
			/>
		{/each}
	{/if}
</div>

<style>
	.carousel {
		position: relative;
		overflow: hidden;
	}

	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--fs);
		line-height: 1.25;
		color: var(--dim);
		white-space: pre;
		user-select: none;

		:global(.c2) {
			color: var(--accent);
		}

		:global(.c3) {
			color: var(--text);
		}
	}

	img {
		position: absolute;
		object-fit: cover;
		pointer-events: none;
	}
</style>
