<script lang="ts">
	// A yes/no confirm dialog drawn as a TUI window: box-drawing frame,
	// kaomoji buddy, and box-drawing buttons with transparent hotspots.
	// Fixed-width grid, so hotspots position in ch/em units - no measuring.
	// The SAFE choice is the accented primary; escape / backdrop = no.
	interface Props {
		open?: boolean;
		title: string;
		message: string;
		face?: string;
		yesLabel?: string;
		noLabel?: string;
		/** placeholder for an optional drawn input field (rendered when set) */
		input?: string;
		/** the input field's value */
		inputValue?: string;
		/** destructive confirms get the heavier "danger" sound */
		danger?: boolean;
		/** error line drawn inside the box (red) - e.g. a failed submit */
		error?: string | null;
		/** set false to keep the dialog open on yes (parent closes on success) */
		closeOnYes?: boolean;
		/** called when the user confirms - the dialog closes either way */
		onyes?: () => void;
	}

	let {
		open = $bindable(false),
		title,
		message,
		face = '[ o~o ]',
		yesLabel = 'yes',
		noLabel = 'no',
		input = undefined,
		inputValue = $bindable(''),
		danger = false,
		error = null,
		closeOnYes = true,
		onyes
	}: Props = $props();

	interface Cell {
		ch: string;
		cls: string;
	}

	interface Hotspot {
		id: 'yes' | 'no';
		row: number;
		x: number;
		w: number;
	}

	let pre: HTMLPreElement | undefined = $state();
	let ta: HTMLTextAreaElement | undefined = $state();
	let hovered = $state<string | null>(null);
	let inputFocused = $state(false);
	// the input is a textarea whose drawn box grows with its content
	let inputLines = $state(1);
	const MAX_LINES = 6;

	$effect(() => {
		void inputValue; // re-measure whenever the content changes
		if (!ta) return;

		ta.style.height = '0px';
		const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
		inputLines = Math.max(1, Math.min(MAX_LINES, Math.round(ta.scrollHeight / lh)));
		ta.style.height = `${inputLines * LH}em`;
	});

	const W = 52;
	const LH = 1.25; // row height in em - same ratio as every TUI here

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

	const built = $derived.by(() => {
		const inner = W - 4;
		const rows: Cell[][] = [];
		const hotspots: Hotspot[] = [];
		let inputRow = -1;

		const s = (str: string, cls = ''): Cell[] => [...str].map((ch) => ({ ch, cls }));
		const row = (content: Cell[]) => {
			const mid = content.slice(0, inner);
			while (mid.length < inner) mid.push({ ch: ' ', cls: '' });
			rows.push([...s('│ '), ...mid, ...s(' │')]);
		};

		const blank = () => row([]);

		// title bar
		{
			const t = [...s('─ ', ''), ...s(title, 'c4'), ...s(' ')];
			rows.push([...s('╭'), ...t, ...s('─'.repeat(Math.max(0, W - 2 - t.length))), ...s('╮')]);
		}

		blank();

		// buddy + message
		{
			const indent = face.length + 2;
			wrap(message, inner - indent - 2).forEach((line, i) => {
				const lead = i === 0 ? [...s(face, 'c2'), ...s('  ')] : s(' '.repeat(indent));
				row([...lead, ...s(line, 'c3')]);
			});
		}

		blank();

		// optional drawn input field - a DOM <textarea> overlays the middle
		// rows, and the box grows with the content (up to MAX_LINES)
		if (input !== undefined) {
			const border = inputFocused ? 'c2' : '';
			row(s(`╭${'─'.repeat(inner - 2)}╮`, border));
			inputRow = rows.length;
			for (let i = 0; i < inputLines; i++) {
				row([{ ch: '│', cls: border }, ...s(' '.repeat(inner - 2)), { ch: '│', cls: border }]);
			}

			row(s(`╰${'─'.repeat(inner - 2)}╯`, border));
			blank();
		}

		// the error, right where the user is looking
		if (error) {
			wrap(`! ${error}`, inner - 2).forEach((line) => row(s(line, 'c2')));
			blank();
		}

		// buttons - the destructive yes stays quiet, the safe no is primary
		{
			const btns = [
				{ id: 'yes' as const, label: yesLabel, primary: false },
				{ id: 'no' as const, label: noLabel, primary: true }
			];

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
				const border = b.primary ? 'c2' : '';
				const labelCls = hovered === b.id ? 'inv' : b.primary ? 'c2' : 'c3';
				hotspots.push({ id: b.id, row: rows.length, x: 2 + top.length, w: w + 2 });
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
		}

		blank();

		rows.push([...s('╰'), ...s('─'.repeat(W - 2)), ...s('╯')]);
		return { rows, hotspots, inputRow };
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

			if (i < built.rows.length - 1) {
				out += '\n';
			}
		});

		if (cur) {
			out += '</span>';
		}

		pre.innerHTML = out;
	});

	function choose(id: 'yes' | 'no') {
		if (id === 'yes') {
			if (closeOnYes) {
				open = false;
				hovered = null;
			}

			onyes?.();
			return;
		}

		open = false;
		hovered = null;
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape') {
			open = false;
		}
	}}
/>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<!-- escape-to-close is handled on the window above -->
	<div class="backdrop" role="presentation" onclick={() => (open = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			class="modal"
			role="alertdialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<pre bind:this={pre} aria-hidden="true"></pre>
			{#if built.inputRow >= 0}
				<textarea
					class="in"
					bind:this={ta}
					style={`left:4ch;top:calc(${built.inputRow * LH}em);width:${W - 8}ch;height:calc(${inputLines * LH}em)`}
					placeholder={input}
					rows="1"
					maxlength="500"
					spellcheck="false"
					bind:value={inputValue}
					onfocus={() => (inputFocused = true)}
					onblur={() => (inputFocused = false)}></textarea>
			{/if}
			{#each built.hotspots as h (h.id)}
				<button
					class="hs"
					style={`left:${h.x}ch;top:calc(${h.row * LH}em);width:${h.w}ch;height:calc(${3 * LH}em)`}
					data-sound={h.id === 'yes' ? (danger ? 'danger' : undefined) : 'back'}
					aria-label={h.id === 'yes' ? yesLabel : noLabel}
					onclick={() => choose(h.id)}
					onpointerenter={() => (hovered = h.id)}
					onpointerleave={() => (hovered = null)}
				></button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		backdrop-filter: blur(2px);
		display: grid;
		place-items: center;
	}

	.modal {
		position: relative;
		font-size: var(--fs-md);
		max-width: 94vw;
		overflow-x: auto;
	}

	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: inherit;
		line-height: 1.25;
		color: var(--dim);
		white-space: pre;
		background: var(--bg);
		/* the grid is decoration - selection fights the hotspots */
		user-select: none;

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
	}

	.hs {
		position: absolute;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;

		/* hotspots are positioned in ch/em - buttons do NOT inherit font by
		   default, which would make those units resolve against the UA's
		   button font and land the hit targets way off the drawn buttons */
		font: inherit;
	}

	/* the optional input, typing straight into its drawn box (ch/em need
	   font: inherit here too - form controls default to the UA font) */
	.in {
		position: absolute;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		font: inherit;
		line-height: 1.25;
		color: var(--text);
		caret-color: var(--accent);
		resize: none;
		overflow-y: auto;
		white-space: pre-wrap;

		&:focus {
			outline: none;
		}

		&::placeholder {
			color: color-mix(in srgb, var(--dim) 75%, transparent);
		}
	}
</style>
