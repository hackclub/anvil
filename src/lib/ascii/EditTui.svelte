<script lang="ts">
	// The edit-project form as a TUI: one box-drawing window where every
	// field is a drawn box-drawing input with a real DOM <input>/<textarea>
	// overlaid on its rows (the search-box trick, generalized). All inputs
	// belong to one <form> via the form="" attribute so the delete button
	// can live in its own form without illegal nesting. The screenshot
	// thumbnail previews whatever will actually be uploaded - the freshly
	// picked file (object URL) or the currently stored one.
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import TuiConfirm from './TuiConfirm.svelte';
	import { measureCharWidth } from './measureChar';

	export interface KeyInfo {
		key: string;
		seconds: number;
	}

	interface Props {
		project: {
			id: number;
			title: string;
			description: string;
			demoUrl: string;
			repoUrl: string;
			screenshotUrl: string | null;
		};
		/** hackatime keys linked to this project */
		linked: string[];
		/** ALL of the user's hackatime projects (recency-sorted), with seconds */
		available: KeyInfo[];
		/** hackatime key -> title of the OTHER project it's assigned to */
		assignedElsewhere: Record<string, string>;
		error?: string | null;
		/** opens the "what should my demo be?" explainer */
		onexplain?: () => void;
		cell?: number;
	}

	let { project, linked, available, assignedElsewhere, error = null, onexplain, cell = 16 }: Props = $props();

	interface Cell {
		ch: string;
		cls: string;
	}

	interface Hotspot {
		id: string;
		type: 'explain' | 'file' | 'save' | 'delete' | 'toggleKey' | 'scrollUp' | 'scrollDown';
		row: number;
		rows: number;
		x: number;
		w: number;
		key?: string;
		label: string;
	}

	interface InputSlot {
		name: string;
		row: number;
		rows: number;
	}

	let host: HTMLDivElement | undefined = $state();
	let pre: HTMLPreElement | undefined = $state();
	let fileEl: HTMLInputElement | undefined = $state();
	let deleteForm: HTMLFormElement | undefined = $state();
	let confirmOpen = $state(false);
	let cols = $state(80);
	let charW = $state(9.6);
	// same airy grid as the project page: rows are 1.25 cells tall
	const rowH = $derived(Math.round(cell * 1.25));
	let hovered = $state<string | null>(null);
	let focusedField = $state<string | null>(null);
	let saving = $state(false);
	let pickedName = $state('');
	let pickedUrl = $state<string | null>(null);
	let scroll = $state(0); // hackatime list scroll offset
	let filter = $state(''); // "/" search over hackatime keys
	let searchFocused = $state(false);
	// row range of the scrollable list - the wheel only hijacks page
	// scrolling while the pointer is INSIDE the list
	let listR0 = -1;
	let listR1 = -1;
	const LIST_MAX = 10;

	const DESC_ROWS = 4;
	const IMG_ROWS = 9;

	const fmtHM = (s: number) => {
		const h = Math.floor(s / 3600);
		const m = Math.min(59, Math.floor((s % 3600) / 60));
		return `${h}h ${m}m`;
	};

	// ONE stable list, same semantics as the project page: rows never move
	// when toggled, keys assigned to other projects are struck out
	interface ListKey {
		key: string;
		linked: boolean;
		seconds: number;
		assignedTo?: string;
	}

	const listKeys = $derived.by((): ListKey[] => {
		const rows: ListKey[] = available.map((k) => ({
			key: k.key,
			linked: linked.includes(k.key),
			seconds: k.seconds,
			assignedTo: assignedElsewhere[k.key]
		}));
		// linked keys hackatime no longer reports still need to be unlinkable
		for (const lk of linked) {
			if (!rows.some((r) => r.key === lk)) {
				rows.push({ key: lk, linked: true, seconds: 0 });
			}
		}

		return rows;
	});

	const filteredKeys = $derived(
		filter.trim() ? listKeys.filter((k) => k.key.toLowerCase().includes(filter.trim().toLowerCase())) : listKeys
	);

	function onFilePicked() {
		const f = fileEl?.files?.[0];
		if (pickedUrl) {
			URL.revokeObjectURL(pickedUrl);
		}

		pickedName = f?.name ?? '';
		pickedUrl = f ? URL.createObjectURL(f) : null;
	}

	// what the thumbnail shows = what would be stored after saving
	const previewUrl = $derived(pickedUrl ?? project.screenshotUrl);

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

	// ── grid construction ──────────────────────────────────────────────────
	const built = $derived.by(() => {
		const W = Math.max(52, cols);
		const inner = W - 4;
		const rows: Cell[][] = [];
		const hotspots: Hotspot[] = [];
		const inputs: InputSlot[] = [];
		let imgRow = -1;
		let searchRow = -1;
		listR0 = -1; // reset - set while the hackatime list draws
		listR1 = -1;

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

		const rule = (label?: string) => {
			let mid: Cell[] = [];
			if (label) {
				mid = [...s('─ '), ...s(label, 'c4'), ...s(' ')];
			}

			rows.push([...s('├'), ...mid, ...s('─'.repeat(Math.max(0, W - 2 - mid.length))), ...s('┤')]);
		};

		const blank = () => row([]);
		const hot = (h: Omit<Hotspot, 'row'> & { row?: number }) => hotspots.push({ row: rows.length, ...h });

		// a drawn input field - the DOM input overlays the inside rows
		const inputBox = (name: string, h = 1) => {
			const border = focusedField === name ? 'c2' : '';
			row(s(`╭${'─'.repeat(inner - 2)}╮`, border));
			inputs.push({ name, row: rows.length, rows: h });
			for (let i = 0; i < h; i++) {
				row([{ ch: '│', cls: border }, ...s(' '.repeat(inner - 2)), { ch: '│', cls: border }]);
			}

			row(s(`╰${'─'.repeat(inner - 2)}╯`, border));
		};

		// field label + dim sublabel (optional right-aligned hotspot text)
		const field = (
			label: string,
			sub: string,
			opts?: { required?: boolean; subRight?: string; subRightId?: string }
		) => {
			row([...s(label, 'c3'), ...(opts?.required ? [...s(' '), ...s('*', 'c2')] : [])]);
			const right = opts?.subRight ? s(opts.subRight, hovered === opts.subRightId ? 'hov' : 'c2') : [];

			if (opts?.subRight && opts.subRightId) {
				hot({
					id: opts.subRightId,
					type: 'explain',
					rows: 1,
					x: 2 + inner - opts.subRight.length,
					w: opts.subRight.length,
					label: opts.subRight
				});
			}

			row(s(sub, 'c1'), right);
		};

		// box-drawing button band, shared look with the project page
		interface Btn {
			id: string;
			label: string;
			type: Hotspot['type'];
			primary?: boolean;
			disabled?: boolean;
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

				const w = b.label.length + 2;
				const border = b.disabled ? '' : b.primary ? 'c2' : '';
				const labelCls = b.disabled ? '' : hovered === b.id ? 'inv' : b.primary ? 'c2' : 'c3';
				if (!b.disabled) {
					hot({ id: b.id, type: b.type, rows: 3, x: 2 + top.length, w: w + 2, label: b.label });
				}

				top.push(...s(`╭${'─'.repeat(w)}╮`, border));
				mid.push(
					{ ch: '│', cls: border },
					{ ch: ' ', cls: labelCls },
					...[...b.label].map((ch) => ({ ch, cls: labelCls })),
					{ ch: ' ', cls: labelCls },
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
			const title = [...s('─ ', ''), ...s(`edit - ${project.title}`, 'c4'), ...s(' ')];
			rows.push([...s('╭'), ...title, ...s('─'.repeat(Math.max(0, W - 2 - title.length))), ...s('╮')]);
		}

		blank();

		// ── the guide buddy ───────────────────────────────────────────────
		{
			const face = '[ =w= ]';
			const msg = 'make it shine! everything here is exactly what the reviewers will see.';
			const indent = face.length + 2;
			wrap(msg, inner - indent - 2).forEach((line, i) => {
				const lead = i === 0 ? [...s(face, 'c2'), ...s('  ')] : s(' '.repeat(indent));
				row([...lead, ...s(line, 'c3')]);
			});
		}

		blank();

		field('title', "what's your project called?", { required: true });
		inputBox('title');
		blank();

		field('description', 'in a few sentences, describe what it does!');
		inputBox('description', DESC_ROWS);
		blank();

		field('repo link', 'usually a Git repo!');
		inputBox('repoUrl');
		blank();

		field('demo link', 'a deployed, live version of your project.', {
			subRight: '[ what should my demo be? ]',
			subRightId: 'explain'
		});

		inputBox('demoUrl');
		blank();

		field(
			`screenshot${project.screenshotUrl ? ' (replaces current)' : ''}`,
			"a screenshot of your project in action! can't be a logo!"
		);

		{
			// choose-a-file band with the picked filename beside it
			const label = 'choose a file';
			const w = label.length + 2;
			const border = '';
			const labelCls = hovered === 'file' ? 'inv' : 'c3';
			hot({ id: 'file', type: 'file', rows: 3, x: 2, w: w + 2, label });
			row(s(`╭${'─'.repeat(w)}╮`, border));
			row([
				{ ch: '│', cls: border },
				{ ch: ' ', cls: labelCls },
				...[...label].map((ch) => ({ ch, cls: labelCls })),
				{ ch: ' ', cls: labelCls },
				{ ch: '│', cls: border },
				...s('  '),
				...s(pickedName || 'no file selected', 'c1')
			]);

			row(s(`╰${'─'.repeat(w)}╯`, border));
		}

		if (previewUrl) {
			blank();
			imgRow = rows.length;
			for (let i = 0; i < IMG_ROWS; i++) blank();
		}

		blank();

		// ── hackatime (toggles save instantly - no save button needed) ────
		rule('hackatime');
		blank();
		row(s('select the projects that represent work on your project!', 'c3'));
		blank();
		if (listKeys.length === 0) {
			row(s("no hackatime projects found yet - track some time and they'll", 'c1'));
			row(s('show up here!', 'c1'));
		} else {
			listR0 = rows.length;
			const maxOffset = Math.max(0, filteredKeys.length - LIST_MAX);
			const off = Math.min(scroll, maxOffset);
			if (off > 0) {
				hot({ id: 'scrollUp', type: 'scrollUp', rows: 1, x: 2, w: inner, label: 'scroll up' });
				row(s(`▲ ${off} more`, hovered === 'scrollUp' ? 'hov' : 'c1'));
			}

			if (filter.trim() && filteredKeys.length === 0) {
				row(s(`no hackatime projects match "${filter.trim()}"`, 'c1'));
			}

			for (const k of filteredKeys.slice(off, off + LIST_MAX)) {
				if (k.assignedTo) {
					// taken by another project: struck out, inert
					row([...s('[-] ', ''), ...s(k.key, 'strike')], s(`assigned to ${k.assignedTo}`, 'c1'));
					continue;
				}

				const id = `key:${k.key}`;
				hot({
					id,
					type: 'toggleKey',
					rows: 1,
					x: 2,
					w: inner,
					key: k.key,
					label: `${k.linked ? 'unlink' : 'link'} ${k.key}`
				});

				const hov = hovered === id;
				row(
					[
						...s(k.linked ? '[x] ' : '[ ] ', hov ? 'hov' : k.linked ? 'c2' : ''),
						...s(k.key, hov ? 'hov' : k.linked ? 'c3' : 'c1')
					],
					s(fmtHM(k.seconds), hov ? 'hov' : 'c1')
				);
			}

			const below = filteredKeys.length - (off + LIST_MAX);
			if (below > 0) {
				hot({
					id: 'scrollDown',
					type: 'scrollDown',
					rows: 1,
					x: 2,
					w: inner,
					label: 'scroll down'
				});

				row(s(`▼ ${below} more (scroll)`, hovered === 'scrollDown' ? 'hov' : 'c1'));
			}

			listR1 = rows.length;

			// "/" search under the list - full-width box-drawing input field
			const border = searchFocused ? 'c2' : '';
			row(s(`╭${'─'.repeat(inner - 2)}╮`, border));
			searchRow = rows.length;
			row([{ ch: '│', cls: border }, ...s(' / ', 'c2'), ...s(' '.repeat(inner - 5)), { ch: '│', cls: border }]);

			row(s(`╰${'─'.repeat(inner - 2)}╯`, border));
		}

		blank();

		if (error) {
			row(s(`! ${error}`, 'c2'));
			blank();
		}

		btnBand([
			{
				id: 'save',
				label: saving ? 'saving...' : '▸ save changes',
				type: 'save',
				primary: true,
				disabled: saving
			}
		]);

		blank();

		// ── danger zone ───────────────────────────────────────────────────
		rule('danger');
		blank();
		btnBand([{ id: 'delete', label: '× delete project', type: 'delete' }]);
		blank();

		rows.push([...s('╰'), ...s('─'.repeat(W - 2)), ...s('╯')]);
		return { rows, hotspots, inputs, imgRow, searchRow };
	});

	function bumpScroll(delta: number) {
		const maxOffset = Math.max(0, filteredKeys.length - LIST_MAX);
		scroll = Math.max(0, Math.min(maxOffset, scroll + delta));
	}

	function onWheel(e: WheelEvent) {
		if (filteredKeys.length <= LIST_MAX || !host) return;

		const rowAt = Math.floor((e.clientY - host.getBoundingClientRect().top) / rowH);
		if (rowAt < listR0 || rowAt >= listR1) return;
		// let the page scroll
		e.preventDefault();
		bumpScroll(Math.sign(e.deltaY));
	}

	// paint the grid whenever it changes
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
		return () => {
			ro.disconnect();
			if (pickedUrl) {
				URL.revokeObjectURL(pickedUrl);
			}
		};
	});

	const inputStyle = (slot: { row: number; rows: number }) =>
		`left:${4 * charW}px;top:${slot.row * rowH}px;width:${(Math.max(52, cols) - 4 - 6) * charW}px;height:${slot.rows * rowH}px`;
</script>

<div class="tui" bind:this={host} style="--fs: {cell}px; --lh: {rowH}px" onwheel={onWheel}>
	<pre bind:this={pre} aria-hidden="true"></pre>

	<!-- the update form itself is empty except the hidden file input; all
	     visible inputs attach to it via form="editform" -->
	<form
		id="editform"
		method="POST"
		action="?/update"
		enctype="multipart/form-data"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update();
			};
		}}
	>
		<input
			bind:this={fileEl}
			type="file"
			name="screenshot"
			accept="image/*"
			class="hidden-file"
			tabindex="-1"
			onchange={onFilePicked}
		/>
	</form>

	<!-- submitted ONLY via the TUI confirm dialog's "yes" -->
	<form bind:this={deleteForm} method="POST" action="?/delete" use:enhance hidden></form>

	{#each built.inputs as slot (slot.name)}
		{#if slot.name === 'title'}
			<input
				class="field"
				style={inputStyle(slot)}
				form="editform"
				name="title"
				required
				maxlength="80"
				value={project.title}
				spellcheck="false"
				autocomplete="off"
				onfocus={() => (focusedField = 'title')}
				onblur={() => (focusedField = null)}
			/>
		{:else if slot.name === 'description'}
			<textarea
				class="field area"
				style={inputStyle(slot)}
				form="editform"
				name="description"
				maxlength="2000"
				value={project.description}
				spellcheck="false"
				onfocus={() => (focusedField = 'description')}
				onblur={() => (focusedField = null)}></textarea>
		{:else}
			<input
				class="field"
				style={inputStyle(slot)}
				form="editform"
				name={slot.name}
				type="url"
				value={slot.name === 'repoUrl' ? project.repoUrl : project.demoUrl}
				spellcheck="false"
				autocomplete="off"
				onfocus={() => (focusedField = slot.name)}
				onblur={() => (focusedField = null)}
			/>
		{/if}
	{/each}

	{#each built.hotspots as h (h.id)}
		{@const style = `left:${h.x * charW}px;top:${h.row * rowH}px;width:${h.w * charW}px;height:${h.rows * rowH}px`}
		{#if h.type === 'delete'}
			<!-- opens the TUI confirm - only a modal "yes" submits the form -->
			<button
				class="hs"
				type="button"
				aria-label={h.label}
				{style}
				onclick={() => (confirmOpen = true)}
				onpointerenter={() => (hovered = h.id)}
				onpointerleave={() => (hovered = null)}
			></button>
		{:else if h.type === 'save'}
			<button
				class="hs"
				type="submit"
				form="editform"
				aria-label={h.label}
				{style}
				onpointerenter={() => (hovered = h.id)}
				onpointerleave={() => (hovered = null)}
			></button>
		{:else if h.type === 'toggleKey'}
			<form method="POST" action="?/toggleKey" use:enhance>
				<input type="hidden" name="key" value={h.key} />
				<button
					class="hs"
					aria-label={h.label}
					{style}
					onpointerenter={() => (hovered = h.id)}
					onpointerleave={() => (hovered = null)}
				></button>
			</form>
		{:else if h.type === 'scrollUp' || h.type === 'scrollDown'}
			<button
				class="hs"
				type="button"
				aria-label={h.label}
				{style}
				onclick={() => bumpScroll(h.type === 'scrollUp' ? -1 : 1)}
				onpointerenter={() => (hovered = h.id)}
				onpointerleave={() => (hovered = null)}
			></button>
		{:else}
			<button
				class="hs"
				type="button"
				aria-label={h.label}
				{style}
				onclick={() => (h.type === 'file' ? fileEl?.click() : onexplain?.())}
				onpointerenter={() => (hovered = h.id)}
				onpointerleave={() => (hovered = null)}
			></button>
		{/if}
	{/each}

	{#if built.searchRow >= 0}
		<input
			class="search"
			style={`left:${6 * charW}px;top:${built.searchRow * rowH}px;width:${(Math.max(52, cols) - 10) * charW}px;height:${rowH}px`}
			placeholder="type to search your hackatime projects..."
			aria-label="search hackatime projects"
			spellcheck="false"
			autocomplete="off"
			bind:value={filter}
			oninput={() => (scroll = 0)}
			onfocus={() => (searchFocused = true)}
			onblur={() => (searchFocused = false)}
		/>
	{/if}

	{#if built.imgRow >= 0 && previewUrl}
		<img
			class="shot"
			src={previewUrl}
			alt="screenshot preview"
			style={`left:${2 * charW}px;top:${built.imgRow * rowH}px;height:${IMG_ROWS * rowH - 4}px`}
		/>
	{/if}
</div>

<TuiConfirm
	bind:open={confirmOpen}
	danger
	title="delete project"
	message="delete this project? tracked history is kept for audit - but this can't be undone!"
	yesLabel="× yes, delete it"
	noLabel="no, keep it!"
	onyes={() => deleteForm?.requestSubmit()}
/>

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
		/* the grid is decoration - selection fights the hotspots */
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

		:global(.strike) {
			color: var(--dim);
			text-decoration: line-through;
		}
	}

	.hs {
		position: absolute;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	/* DOM inputs typing straight into the drawn boxes */
	.field {
		position: absolute;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--fs);
		line-height: var(--lh);
		color: var(--text);
		caret-color: var(--accent);

		&:focus {
			outline: none;
		}
	}

	.area {
		resize: none;
		overflow-y: auto;
		white-space: pre-wrap;
	}

	.hidden-file {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		overflow: hidden;
	}

	/* the "/" filter - a DOM input typing straight into the grid */
	.search {
		position: absolute;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--fs);
		line-height: var(--lh);
		color: var(--text);
		caret-color: var(--accent);

		&:focus {
			outline: none;
		}

		&::placeholder {
			color: color-mix(in srgb, var(--dim) 75%, transparent);
		}
	}

	/* the upload preview sits in rows the grid reserves for it */
	.shot {
		position: absolute;
		border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);
		max-width: 60%;
	}
</style>
