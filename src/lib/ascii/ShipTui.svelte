<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { measureCharWidth } from './measureChar';
	import { Pending, withPending } from '$lib/pending.svelte';

	export interface ShipCheckRow {
		id: string;
		label: string;
		level: 'error' | 'warn';
		ok: boolean;
		detail: string;
	}

	interface Props {
		project: {
			id: number;
			title: string;
			description: string;
			repoUrl: string | null;
			demoUrl: string | null;
			screenshotUrl: string | null;
		};
		checks: ShipCheckRow[];
		totalSeconds: number;
		blocked: boolean;
		error?: string | null;
		/** opens the "what should my demo be?" explainer */
		onexplain?: () => void;
		cell?: number;
	}

	let { project, checks, totalSeconds, blocked, error = null, onexplain, cell = 16 }: Props = $props();

	interface Cell {
		ch: string;
		cls: string;
	}

	interface Hotspot {
		id: string;
		type: 'link' | 'confirm' | 'explain';
		row: number;
		rows: number;
		x: number;
		w: number;
		href?: string;
		label: string;
	}

	let host: HTMLDivElement | undefined = $state();
	let pre: HTMLPreElement | undefined = $state();
	let cols = $state(80);
	let charW = $state(9.6);
	// same airy grid as the project page: rows are 1.25 cells tall
	const rowH = $derived(Math.round(cell * 1.25));
	let hovered = $state<string | null>(null);
	// label swaps to "shipping..." only past 100ms; the button locks instantly
	const confirming = new Pending();
	let tick = $state(0); // animation clock (~9fps, terminal cadence)

	const fmtHM = (s: number) => {
		const h = Math.floor(s / 3600);
		const m = Math.min(59, Math.floor((s % 3600) / 60));
		return `${h}h ${m}m`;
	};

	const warnings = $derived(checks.filter((c) => c.level === 'warn' && !c.ok));

	function wrap(text: string, maxW: number): string[] {
		const out: string[] = [];
		for (const seg of text.split('\n')) {
			let line = '';
			for (const w of seg.split(' ')) {
				if (line && line.length + 1 + w.length > maxW) {
					out.push(line);
					line = w;
				} else {
					line = line ? line + ' ' + w : w;
				}
			}

			if (line) {
				out.push(line);
			}
		}

		return out;
	}

	type Seg = { text: string; cls?: string };
	/** word-wrap styled segments into lines of cells */
	function wrapSegs(segs: Seg[], maxW: number): Cell[][] {
		const words: { w: string; cls: string }[] = [];
		for (const seg of segs) {
			for (const w of seg.text.split(' ')) {
				if (w) {
					words.push({ w, cls: seg.cls ?? 'c3' });
				}
			}
		}

		const lines: Cell[][] = [];
		let line: Cell[] = [];
		for (const { w, cls } of words) {
			const need = (line.length ? 1 : 0) + w.length;
			if (line.length && line.length + need > maxW) {
				lines.push(line);
				line = [];
			}

			if (line.length) {
				line.push({ ch: ' ', cls: '' });
			}

			line.push(...[...w].map((ch) => ({ ch, cls })));
		}

		if (line.length) {
			lines.push(line);
		}

		return lines;
	}

	const guide = $derived.by((): { face: string; segs: Seg[] } => {
		if (blocked) {
			return {
				face: '[ >~< ]',
				segs: [
					{
						text: 'uh oh! we found some problems below - fix them up and come back. hit '
					},
					{ text: 'edit project!', cls: 'c2' }
				]
			};
		}

		if (warnings.length > 0) {
			return {
				face: '[ o.o ]',
				segs: [
					{ text: "one last look before it goes to review! you're submitting " },
					{ text: `${fmtHM(totalSeconds)}`, cls: 'c2' },
					{
						text: "of tracked work. heads up on the warnings below - you can still ship if you're sure!"
					}
				]
			};
		}

		return {
			face: '[ ^w^ ]/',
			segs: [
				{ text: "everything checks out! one last look - you're submitting " },
				{ text: `${fmtHM(totalSeconds)}`, cls: 'c2' },
				{ text: 'of tracked work. once shipped, our reviewers take it from here!' }
			]
		};
	});

	// ── grid construction ──────────────────────────────────────────────────
	const IMG_ROWS = 10;
	const built = $derived.by(() => {
		const W = Math.max(52, cols);
		const inner = W - 4;
		const rows: Cell[][] = [];
		const hotspots: Hotspot[] = [];
		let imgRow = -1;

		const s = (str: string, cls = ''): Cell[] => [...str].map((ch) => ({ ch, cls }));
		const pad = (cells: Cell[], w: number): Cell[] => {
			const out = cells.slice(0, w);
			while (out.length < w) out.push({ ch: ' ', cls: '' });
			return out;
		};

		const row = (content: Cell[], right: Cell[] = []) => {
			const mid = pad(content, inner - right.length);
			rows.push([...s('│ '), ...mid, ...right, ...s(' │')]);
		};

		const rule = (label?: string, right?: string) => {
			let mid: Cell[] = [];
			const rightPart = right ? ` ${right} ` : '';
			if (label) {
				mid = [...s('─ '), ...s(label, 'c4'), ...s(' ')];
			}

			const fill = W - 2 - mid.length - rightPart.length - (right ? 1 : 0);
			rows.push([
				...s('├'),
				...mid,
				...s('─'.repeat(Math.max(0, fill))),
				...(right ? [...s(rightPart, ''), ...s('─')] : []),
				...s('┤')
			]);
		};

		const blank = () => row([]);
		const hot = (h: Omit<Hotspot, 'row'> & { row?: number }) => hotspots.push({ row: rows.length, ...h });

		// box-drawing button band, shared look with the project page
		interface Btn {
			id: string;
			label: string;
			type: Hotspot['type'];
			href?: string;
			primary?: boolean;
			disabled?: boolean;
			fullWidth?: boolean;
		}

		const btnBand = (btns: Btn[]) => {
			const top: Cell[] = [];
			const mid: Cell[] = [];
			const bot: Cell[] = [];
			for (const b of btns) {
				if (top.length) {
					top.push(...s('  '));
					mid.push(...s('  '));
					bot.push(...s('  '));
				}

				const w = b.fullWidth ? inner - 2 : b.label.length + 2;
				const lp = Math.max(1, Math.floor((w - b.label.length) / 2));
				const rp = Math.max(1, w - b.label.length - lp);
				const border = b.disabled ? '' : b.primary ? 'c2' : '';
				const labelCls = b.disabled ? '' : hovered === b.id ? 'inv' : b.primary ? 'c2' : 'c3';
				if (!b.disabled) {
					hot({
						id: b.id,
						type: b.type,
						rows: 3,
						x: 2 + top.length,
						w: w + 2,
						href: b.href,
						label: b.label
					});
				}

				top.push(...s(`╭${'─'.repeat(w)}╮`, border));
				mid.push(
					{ ch: '│', cls: border },
					...s(' '.repeat(lp), labelCls),
					...[...b.label].map((ch) => ({ ch, cls: labelCls })),
					...s(' '.repeat(rp), labelCls),
					{ ch: '│', cls: border }
				);

				bot.push(...s(`╰${'─'.repeat(w)}╯`, border));
			}

			row(top);
			row(mid);
			row(bot);
		};

		// ── title bar ─────────────────────────────────────────────────────
		{
			const status = blocked ? 'BLOCKED' : 'PREFLIGHT';
			const statusCells = s(status, blocked ? 'c2' : 'c1');
			const title = [...s('─ ', ''), ...s(`ship - ${project.title}`, 'c4'), ...s(' ')];
			const fill = W - 5 - title.length - statusCells.length;
			rows.push([...s('╭'), ...title, ...s('─'.repeat(Math.max(0, fill))), ...s(' '), ...statusCells, ...s(' ─╮')]);
		}

		// ── the sea ──────────
		{
			const ANIM_H = 6;
			const SURFACE = 4; // anim row the boat floats on
			const t = tick;
			const sea: Cell[][] = [];
			for (let r = 0; r < ANIM_H; r++) {
				const line: Cell[] = [];
				for (let x = 0; x < inner; x++) {
					if (r < SURFACE) {
						// sparse star field, drifting slowly leftward
						const xs = x + Math.floor(t / 5) + r * 31;
						const v = ((xs * 2654435761 + r * 40503) >>> 0) % 89;
						line.push(v === 0 ? { ch: '·', cls: 'c1' } : v === 13 ? { ch: '+', cls: '' } : { ch: ' ', cls: '' });
					} else if (r === SURFACE) {
						const w = Math.sin(x * 0.25 + t * 0.18) + 0.55 * Math.sin(x * 0.09 - t * 0.11);
						line.push(w > 0.85 ? { ch: '≈', cls: 'c1' } : w > -0.55 ? { ch: '~', cls: '' } : { ch: ' ', cls: '' });
					} else {
						const w = Math.sin(x * 0.17 - t * 0.12) + 0.5 * Math.sin(x * 0.31 + t * 0.09);
						line.push(w > 0.9 ? { ch: '~', cls: '' } : w > 0.55 ? { ch: '·', cls: '' } : { ch: ' ', cls: '' });
					}
				}

				sea.push(line);
			}

			const bob = Math.sin(t * 0.22) > 0.4 ? 1 : 0;
			const bx = (Math.floor(t * 0.5) % (inner + 24)) - 12;
			const put = (r: number, x: number, ch: string, cls: string) => {
				if (r >= 0 && r < ANIM_H && x >= 0 && x < inner) {
					sea[r][x] = { ch, cls };
				}
			};

			const base = SURFACE - bob;
			put(base - 3, bx + 3, '▸', 'c2'); // pennant
			put(base - 2, bx + 2, '|', 'c3');
			put(base - 2, bx + 3, '\\', 'c3');
			put(base - 1, bx + 2, '|', 'c3');
			put(base - 1, bx + 3, '_', 'c3');
			put(base - 1, bx + 4, '\\', 'c3');
			put(base, bx + 1, '\\', 'c3');
			put(base, bx + 2, '_', 'c3');
			put(base, bx + 3, '_', 'c3');
			put(base, bx + 4, '_', 'c3');
			put(base, bx + 5, '/', 'c3');
			for (const line of sea) row(line);
		}

		rule();
		blank();

		// ── the guide goober ───────────────────────────────────────────────
		{
			const face = guide.face;
			const indent = face.length + 2;
			const lines = wrapSegs(guide.segs, inner - indent - 2);
			lines.forEach((line, i) => {
				const lead = i === 0 ? [...s(face, 'c2'), ...s('  ')] : s(' '.repeat(indent));
				row([...lead, ...line]);
			});
		}

		blank();

		rule('manifest');
		blank();
		const LBL = 13;
		const field = (label: string, cells: Cell[]) => row([...s(label.padEnd(LBL), 'c1'), ...cells]);
		field('title', s(project.title, 'c3'));
		{
			const lines = wrap(project.description || '-', inner - LBL - 2);
			lines.forEach((line, i) => row([...s((i === 0 ? 'description' : '').padEnd(LBL), 'c1'), ...s(line, 'c3')]));
		}

		for (const [label, url] of [
			['repo', project.repoUrl],
			['demo', project.demoUrl]
		] as const) {
			if (!url) {
				field(label, s('-', 'c1'));
				continue;
			}

			const id = `f:${label}`;
			const shown = url.length > inner - LBL - 2 ? url.slice(0, inner - LBL - 3) + '…' : url;
			hot({ id, type: 'link', rows: 1, x: 2 + LBL, w: shown.length, href: url, label: url });
			field(label, s(shown, hovered === id ? 'hov' : 'c2'));
		}

		field('screenshot', project.screenshotUrl ? s('attached:', 'c3') : s('-', 'c1'));
		if (project.screenshotUrl) {
			blank();
			imgRow = rows.length;
			for (let i = 0; i < IMG_ROWS; i++) blank();
		}

		blank();

		// ── preflight checklist ───────────────────────────────────────────
		{
			const okCount = checks.filter((c) => c.ok).length;
			rule('preflight', `${okCount}/${checks.length} ok`);
			blank();

			const labW = Math.max(...checks.map((c) => c.label.length), 1) + 2;
			for (const c of checks) {
				const mark = c.ok ? '[ok]' : c.level === 'warn' ? '[!!]' : '[××]';

				const markCls = c.ok ? 'c1' : 'c2';
				const segs: Seg[] = [{ text: c.detail, cls: 'c1' }];
				if (c.id === 'demo:video' && !c.ok) {
					segs.push({ text: 'click here to check!', cls: 'c2' });
				}

				const lines = wrapSegs(segs, inner - 5 - labW);
				lines.forEach((line, i) => {
					if (i === 0) {
						if (c.id === 'demo:video' && !c.ok) {
							hot({
								id: 'explain',
								type: 'explain',
								rows: lines.length,
								x: 2,
								w: inner,
								label: 'what should my demo be?'
							});
						}

						row([...s(mark, markCls), ...s(' '), ...s(c.label.padEnd(labW), 'c3'), ...line]);
					} else {
						row([...s(' '.repeat(5 + labW)), ...line]);
					}
				});
			}

			blank();
		}

		// ── errors + actions ──────────────────────────────────────────────
		if (error) {
			row(s(`! ${error}`, 'c2'));
			blank();
		}

		if (blocked) {
			btnBand([
				{
					id: 'edit',
					label: 'edit project',
					type: 'link',
					href: `/projects/${project.id}/edit`,
					fullWidth: true
				}
			]);
		} else {
			btnBand([
				{
					id: 'confirm',
					label: confirming.showing ? 'shipping...' : `▸ confirm ship - ${fmtHM(totalSeconds)}`,
					type: 'confirm',
					primary: true,
					fullWidth: true,
					disabled: confirming.active
				}
			]);

			blank();
			btnBand([
				{
					id: 'edit',
					label: 'edit project',
					type: 'link',
					href: `/projects/${project.id}/edit`,
					fullWidth: true
				}
			]);
		}

		blank();

		rows.push([...s('╰'), ...s('─'.repeat(W - 2)), ...s('╯')]);
		return { rows, hotspots, imgRow };
	});

	$effect(() => {
		if (!pre) return;

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

		built.rows.forEach((r, i) => {
			for (const c of r) {
				setRun(c.cls);
				out += c.ch === '<' ? '&lt;' : c.ch === '>' ? '&gt;' : c.ch === '&' ? '&amp;' : c.ch;
			}

			if (i < built.rows.length - 1) {
				out += '\n';
			}
		});

		if (cur) {
			out += '</span>';
		}

		pre.innerHTML = out;
	});

	onMount(() => {
		function measure() {
			if (!host) return;

			charW = measureCharWidth(cell, host);
			cols = Math.max(52, Math.floor(host.getBoundingClientRect().width / charW));
		}

		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(host!);
		const iv = setInterval(() => tick++, 110);
		return () => {
			ro.disconnect();
			clearInterval(iv);
		};
	});
</script>

<div class="tui" bind:this={host} style="--fs: {cell}px; --lh: {rowH}px">
	<pre bind:this={pre} aria-hidden="true"></pre>

	{#each built.hotspots as h (h.id)}
		{@const style = `left:${h.x * charW}px;top:${h.row * rowH}px;width:${h.w * charW}px;height:${h.rows * rowH}px`}
		{#if h.type === 'link'}
			<a
				class="hs"
				href={h.href}
				aria-label={h.label}
				{style}
				target={h.href?.startsWith('http') ? '_blank' : undefined}
				rel={h.href?.startsWith('http') ? 'noreferrer' : undefined}
				onpointerenter={() => (hovered = h.id)}
				onpointerleave={() => (hovered = null)}
			></a>
		{:else if h.type === 'explain'}
			<button
				class="hs"
				aria-label={h.label}
				{style}
				onclick={() => onexplain?.()}
				onpointerenter={() => (hovered = h.id)}
				onpointerleave={() => (hovered = null)}
			></button>
		{:else}
			<form method="POST" action="?/confirm" use:enhance={withPending(confirming)}>
				<button
					class="hs"
					aria-label={h.label}
					{style}
					onpointerenter={() => (hovered = h.id)}
					onpointerleave={() => (hovered = null)}
				></button>
			</form>
		{/if}
	{/each}

	{#if built.imgRow >= 0 && project.screenshotUrl}
		<img
			class="shot"
			src={project.screenshotUrl}
			alt="screenshot of {project.title}"
			style={`left:${(2 + 13) * charW}px;top:${built.imgRow * rowH}px;height:${IMG_ROWS * rowH - 4}px`}
		/>
	{/if}
</div>

<style>
	.tui {
		position: relative;
		font-size: var(--fs);
	}

	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--fs);
		line-height: var(--lh);
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

		:global(.c4) {
			color: var(--text);
			font-weight: 700;
		}

		:global(.inv) {
			background: var(--accent);
			color: var(--bg);
		}

		:global(.hov) {
			background: var(--bg-soft);
			color: var(--accent);
		}
	}

	.hs {
		position: absolute;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	/* the screenshot preview sits in rows the grid reserves for it */
	.shot {
		position: absolute;
		border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);
		max-width: 60%;
	}
</style>
