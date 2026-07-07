<script lang="ts">
	// The project management page as a TUI: one box-drawing window rendered in
	// a single ASCII host. Mouse input works the terminal way - transparent
	// hotspots (links / form-submit buttons) overlay the drawn rows, hovered
	// rows highlight like a selection bar, and the guide buddy walks new
	// users through create → track → ship → review. No emojis - glyphs only.
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import TuiConfirm from './TuiConfirm.svelte';
	import { measureCharWidth } from './measureChar';
	import { Pending, withPending } from '$lib/pending.svelte';

	export interface KeyInfo {
		key: string;
		seconds: number;
	}

	export interface SourceRow {
		id: string;
		kind: string;
		externalRef: string;
		verified: boolean;
		lastValue: number | null;
		/** SCORE this source contributes (computed server-side) */
		score: number;
	}

	export interface ShipRow {
		id: number;
		shipNumber: number;
		status: string;
		secondsSubmitted: number;
		hoursAssigned: number | null;
		submittedAt: string;
	}

	export interface ReviewRow {
		id: string;
		shipId: number;
		kind: string;
		feedback: string | null;
	}

	export interface LevelInfo {
		level: number;
		minScore: number;
		rate: number;
		requiresReview: boolean;
	}

	export interface QuestInfo {
		id: string;
		title: string;
		sparks: number;
		kind: 'repo-polish' | 'readme-mention' | 'share';
		note: string | null;
	}

	interface Props {
		project: {
			id: number;
			title: string;
			description: string;
			demoUrl: string | null;
			repoUrl: string | null;
			shipStatus: string;
			locked: boolean;
			level: number;
			score: number;
			scoreFlagged: boolean;
			maxReviewedLevel: number;
		};
		/** keys linked to this project, with seconds in the current window */
		linkedKeys: KeyInfo[];
		/** ALL of the user's hackatime projects, seconds since season */
		availableKeys: KeyInfo[];
		/** hackatime key -> title of the OTHER project it's assigned to */
		assignedElsewhere: Record<string, string>;
		levels: LevelInfo[];
		quests: { unlocked: boolean; completed: string[]; catalog: QuestInfo[] };
		sources: SourceRow[];
		ships: ShipRow[];
		reviews: ReviewRow[];
		minShipSeconds: number;
		hasHackatime: boolean;
		lastShipSparks: number;
		/** extra sparks this project earned from score (Σ retroactive top-ups) */
		scoreSparks: number;
		cell?: number;
	}

	let {
		project,
		linkedKeys,
		availableKeys,
		assignedElsewhere,
		levels,
		quests,
		sources,
		ships,
		reviews,
		minShipSeconds,
		hasHackatime,
		lastShipSparks,
		scoreSparks,
		cell = 16
	}: Props = $props();

	interface Cell {
		ch: string;
		cls: string;
	}

	interface Hotspot {
		id: string;
		type: 'link' | 'toggleKey' | 'findHackatime' | 'confirm' | 'quest' | 'cancelShip' | 'scrollUp' | 'scrollDown';
		row: number;
		rows: number;
		x: number;
		w: number;
		href?: string;
		key?: string;
		questId?: string;
		label: string;
	}

	let host: HTMLDivElement | undefined = $state();
	let pre: HTMLPreElement | undefined = $state();
	let cols = $state(80);
	let charW = $state(9.6);
	// airier grid: rows are 1.25 cells tall (box-drawing verticals get small
	// gaps, which reads as a subtle dotted frame - intentional)
	const rowH = $derived(Math.round(cell * 1.25));
	let hovered = $state<string | null>(null);
	let scroll = $state(0); // unlinked-keys list scroll offset
	let filter = $state(''); // "/" search over unlinked keys
	let searchFocused = $state(false); // ignites the search box border
	// row range of the scrollable list (set during grid build) - the wheel
	// only hijacks page scrolling while the pointer is INSIDE the list
	let listR0 = -1;
	let listR1 = -1;
	const LIST_MAX = 10;

	const fmtHM = (s: number) => {
		const h = Math.floor(s / 3600);
		const m = Math.min(59, Math.floor((s % 3600) / 60));
		return `${h}h ${m}m`;
	};

	const fmtN = (v: number) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v));
	// relative timestamps, terminal-terse: "just now" / "5m ago" / "3h ago" /
	// "2d ago"; anything past a month falls back to the date
	const fmtD = (iso: string) => {
		const secs = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
		if (secs < 60) return 'just now';

		if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;

		if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;

		if (secs < 30 * 86400) return `${Math.floor(secs / 86400)}d ago`;

		return iso.slice(0, 10);
	};

	const fmtSparks = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

	// selecting hackatime projects is a blocking step for FRESH projects only:
	// a draft with nothing selected shows ONLY the selector until the selection
	// is confirmed. everywhere else (under review, rejected, approved, locked)
	// the selector never appears - key management lives on the edit page.
	// intentionally captures the INITIAL state: staging keys mid-gate must
	// not auto-dismiss the step.
	// svelte-ignore state_referenced_locally
	let confirmed = $state(linkedKeys.length > 0 || project.shipStatus !== 'draft' || project.locked);

	// the gate selector edits a LOCAL selection - toggles never hit the
	// network; "confirm selection" saves the whole set in one ?/setKeys
	// payload. initial selection = whatever is already linked server-side.
	// svelte-ignore state_referenced_locally
	let staged = $state<string[]>(linkedKeys.map((k) => k.key));

	// a staged key borrows its season seconds until the server reports
	// window seconds after the selection is confirmed
	const stagedSeconds = (key: string): number =>
		linkedKeys.find((k) => k.key === key)?.seconds ?? availableKeys.find((k) => k.key === key)?.seconds ?? 0;

	// what drives hours/shippability: the saved links once the gate is
	// passed, the staged selection while the selector is still open
	const effLinkedKeys = $derived.by((): KeyInfo[] =>
		confirmed ? linkedKeys : staged.map((key) => ({ key, seconds: stagedSeconds(key) }))
	);

	const totalSeconds = $derived(effLinkedKeys.reduce((a, k) => a + k.seconds, 0));

	function toggleStaged(key: string) {
		staged = staged.includes(key) ? staged.filter((k) => k !== key) : [...staged, key];
	}

	// ONE stable list: keys never move when toggled - the checkbox flips in
	// place. Linked keys show window seconds; the rest show season totals.
	interface ListKey {
		key: string;
		linked: boolean;
		seconds: number;
		assignedTo?: string;
	}

	const listKeys = $derived.by((): ListKey[] => {
		const linkedMap = new Map(effLinkedKeys.map((k) => [k.key, k.seconds]));
		const rows: ListKey[] = availableKeys.map((k) => ({
			key: k.key,
			linked: linkedMap.has(k.key),
			seconds: linkedMap.get(k.key) ?? k.seconds,
			assignedTo: assignedElsewhere[k.key]
		}));
		// linked keys hackatime no longer reports still need to be unlinkable
		for (const lk of effLinkedKeys) {
			if (!rows.some((r) => r.key === lk.key)) {
				rows.push({ key: lk.key, linked: true, seconds: lk.seconds });
			}
		}

		return rows;
	});

	const filteredKeys = $derived(
		filter.trim() ? listKeys.filter((k) => k.key.toLowerCase().includes(filter.trim().toLowerCase())) : listKeys
	);

	const inFlight = $derived(project.shipStatus === 'pending' || project.shipStatus === 'pending_hq');

	const canShip = $derived(!project.locked && !inFlight && effLinkedKeys.length > 0 && totalSeconds >= minShipSeconds);
	// quest completion goes through the TUI confirm; share quests collect the
	// proof URL via the modal's input, and only a "yes" submits the form
	let questPending = $state<QuestInfo | null>(null);
	let questProof = $state('');
	let questConfirmOpen = $state(false);
	let questForm = $state<HTMLFormElement>();
	// failures render INSIDE the modal (which stays open); success closes it
	let questError = $state<string | null>(null);

	// cancelling a pending ship goes through the danger confirm
	let cancelShipOpen = $state(false);
	let cancelShipForm = $state<HTMLFormElement>();
	const cancellingShip = new Pending();

	// slow-network feedback for the other actions (labels swap after 100ms)
	const finding = new Pending();
	const questing = new Pending();

	// "confirm selection" submits this - saving the staged keys is what
	// dismisses the gate, so a failure keeps the selector open
	let keysForm = $state<HTMLFormElement>();
	const confirmingSel = new Pending();

	// ── the guide buddy (ascii kaomoji only - no emojis in the terminal!) ──
	type Seg = { text: string; cls?: string };
	const guide = $derived.by((): { face: string; segs: Seg[] } => {
		if (project.locked) {
			return {
				face: '[ T-T ]',
				segs: [
					{
						text: "oh noes! this project has been hard rejected... you can't submit any updates to it. you can always make another one, though!"
					}
				]
			};
		}

		if (inFlight) {
			return {
				face: '[ ^w^ ]',
				segs: [
					{
						text: "wahoo! your project is under review. we'll notify you and give you your prize after that's done!"
					}
				]
			};
		}

		if (!confirmed) {
			// the blocking step - the rest of the page stays hidden until the
			// selection is confirmed
			if (effLinkedKeys.length === 0) {
				return {
					face: '[ -w- ]',
					segs: [
						{
							text: 'start coding away with Hackatime enabled. you should see your project down here... select it to continue!'
						}
					]
				};
			}

			return {
				face: '[ >w< ]b',
				segs: [
					{ text: "nice pick! you can select as many as you need. when you're set, hit " },
					// the "!" lives inside the accent segment so it can't wrap alone
					{ text: 'confirm selection!', cls: 'c2' },
					{ text: 'you can always change the selection later, too!' }
				]
			};
		}

		if (project.shipStatus === 'rejected') {
			return {
				face: '[ >~< ]',
				segs: [
					{
						text: 'oh no! your project has been rejected... no worries, you can always fix it! check the '
					},
					{ text: 'ship timeline!', cls: 'c2' }
				]
			};
		}

		if (project.shipStatus === 'approved') {
			return {
				face: '[ >w< ]b',
				segs: [
					{ text: 'yay! your last ship got you ' },
					{ text: `${fmtSparks(lastShipSparks)} ✶!!`, cls: 'c2' },
					{ text: 'earn more by submitting an update - and grow your ' },
					{ text: 'SCORE', cls: 'c2' },
					{ text: 'below to raise your rate!' }
				]
			};
		}

		return {
			face: '[ >w< ]b',
			segs: [
				{
					text: "nice job! continue hacking away on your project. when you're happy with it, click "
				},
				{ text: 'ship!', cls: 'c2' }
			]
		};
	});

	const statusLabel: Record<string, string> = {
		draft: 'DRAFT',
		pending: 'IN REVIEW',
		pending_hq: 'IN REVIEW',
		approved: 'APPROVED',
		rejected: 'NEEDS CHANGES',
		cancelled: 'CANCELLED'
	};

	// ── feedback markdown: bold / italic / `code` / links (+ bare URLs) ──
	interface FbCell extends Cell {
		href?: string;
	}

	const MD_RE =
		/(`[^`]+`)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)|(https?:\/\/[^\s]+)/g;

	function mdCells(text: string): FbCell[] {
		const out: FbCell[] = [];
		const push = (str: string, cls: string, href?: string) => {
			for (const ch of str) out.push({ ch, cls, href });
		};

		let last = 0;
		for (const m of text.matchAll(MD_RE)) {
			push(text.slice(last, m.index), 'c1');
			if (m[1]) {
				push(m[1].slice(1, -1), 'code');
			} else if (m[2]) {
				push(m[2], 'lnk', m[3]);
			} else if (m[4]) {
				push(m[4].slice(2, -2), 'c4');
			} else if (m[5]) {
				push(m[5].slice(1, -1), 'em');
			} else if (m[6]) {
				// underscores only italicize as standalone words - snake_case
				// identifiers stay literal
				const before = m.index === 0 ? ' ' : text[m.index - 1];
				if (/\s/.test(before)) {
					push(m[6].slice(1, -1), 'em');
				} else {
					push(m[6], 'c1');
				}
			} else if (m[7]) {
				// bare URL: trailing punctuation is prose, not address
				const trimmed = m[7].replace(/[.,;:)\]]+$/, '');
				push(trimmed, 'lnk', trimmed);
				push(m[7].slice(trimmed.length), 'c1');
			}

			last = m.index! + m[0].length;
		}

		push(text.slice(last), 'c1');
		return out;
	}
	// greedy word-wrap over styled cells (long words hard-break)
	function wrapFCells(cells: FbCell[], maxW: number): FbCell[][] {
		const lines: FbCell[][] = [];
		let line: FbCell[] = [];
		let word: FbCell[] = [];
		const flush = () => {
			if (word.length === 0) return;

			if (line.length > 0 && line.length + 1 + word.length > maxW) {
				lines.push(line);
				line = [];
			}

			if (line.length > 0) {
				line.push({ ch: ' ', cls: '' });
			}

			while (word.length > maxW) {
				if (line.length > 0) {
					lines.push(line);
					line = [];
				}

				lines.push(word.slice(0, maxW));
				word = word.slice(maxW);
			}

			line.push(...word);
			word = [];
		};

		for (const c of cells) {
			if (c.ch === ' ') {
				flush();
			} else {
				word.push(c);
			}
		}

		flush();
		if (line.length > 0) {
			lines.push(line);
		}

		return lines.length > 0 ? lines : [[]];
	}

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

	// ── grid construction ──────────────────────────────────────────────────
	const built = $derived.by(() => {
		const W = Math.max(52, cols);
		const inner = W - 4;
		const rows: Cell[][] = [];
		const hotspots: Hotspot[] = [];
		let searchRow = -1;
		listR0 = -1; // no key list on this build unless the selector draws one
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

		// box-drawing button band (create-project style) - disabled buttons
		// render fully dim and get no hotspot; fullWidth stretches the box
		// across the window with a centered label
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
			const status = statusLabel[project.shipStatus] ?? project.shipStatus;
			const statusCells = [
				...s(status, project.shipStatus === 'approved' ? 'c2' : 'c1'),
				...(project.locked ? [...s(' '), ...s('LOCKED', 'c2')] : [])
			];

			const title = [...s('─ ', ''), ...s(project.title, 'c4'), ...s(' ')];
			const fill = W - 5 - title.length - statusCells.length;
			rows.push([...s('╭'), ...title, ...s('─'.repeat(Math.max(0, fill))), ...s(' '), ...statusCells, ...s(' ─╮')]);
		}

		blank();

		if (project.description) {
			for (const line of wrap(project.description, inner - 2)) row(s(line, 'c1'));
			blank();
		}

		// ── the guide buddy ───────────────────────────────────────────────
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

		// ── buttons (box-drawing, create-project style) ───────────────────
		// hidden while the hackatime selection hasn't been confirmed -
		// selecting keys is the blocking step before any other action
		if (confirmed) {
			const btns: Btn[] = [];
			// the ship button is always there - greyed out until it's shippable.
			// it leads to the ship REVIEW page (preflight checks), never ships directly
			btns.push({
				id: 'ship',
				label: `▸ ship - ${fmtHM(totalSeconds)}`,
				type: 'link',
				href: `/projects/${project.id}/ship`,
				primary: true,
				disabled: !canShip
			});

			btns.push({
				id: 'edit',
				label: 'edit project',
				type: 'link',
				href: `/projects/${project.id}/edit`
			});
			// a PENDING ship can be pulled back (e.g. to fix metadata);
			// pending_hq means a reviewer already approved it - too late
			if (project.shipStatus === 'pending') {
				btns.push({
					id: 'cancelShip',
					label: cancellingShip.showing ? 'cancelling...' : '× cancel ship',
					type: 'cancelShip',
					disabled: cancellingShip.active
				});
			}

			if (project.repoUrl) {
				btns.push({ id: 'repo', label: 'repo ↗', type: 'link', href: project.repoUrl });
			}

			if (project.demoUrl) {
				btns.push({ id: 'demo', label: 'demo ↗', type: 'link', href: project.demoUrl });
			}

			btnBand(btns);
			blank();
		}

		// ship-blocked hint (when the buddy isn't already explaining it)
		if (confirmed && !canShip && !project.locked && !inFlight && effLinkedKeys.length > 0) {
			row(
				s(
					`track at least ${Math.round(minShipSeconds / 60)} minutes to ship - ${fmtHM(totalSeconds)} counted so far.`,
					'c1'
				)
			);

			blank();
		}

		// ── hackatime (the blocking step - hidden once confirmed) ────────
		if (!confirmed) {
			const nothingTracked = hasHackatime && effLinkedKeys.length === 0 && availableKeys.length === 0;
			// center a line within the window
			const ctr = (str: string, cls = ''): number => {
				const pad = Math.max(0, Math.floor((inner - str.length) / 2));
				row([...s(' '.repeat(pad)), ...s(str, cls)]);
				return 2 + pad; // grid column the text starts at (for hotspots)
			};

			rule('hackatime', fmtHM(totalSeconds));
			blank();
			for (const line of wrap(
				"hackatime is our in-house time tracking plugin! it's how we track you put in the effort in your project.",
				inner - 2
			))
				row(s(line, 'c1'));

			blank();
			// the select prompt only makes sense once there's a list to select from
			if (hasHackatime && !nothingTracked) {
				row(s('select the projects that represent work on your project!', 'c3'));
				blank();
			}

			if (!hasHackatime) {
				for (const line of wrap(
					'psst - no hackatime account found for you yet! hackatime is a lil plugin for your code editor that counts your coding time, so we can reward it. setup takes about a minute:',
					inner - 2
				))
					row(s(line, 'c1'));

				blank();
				{
					const a = '[ set up hackatime ↗ ]';
					const b = '[ watch the setup video ↗ ]';
					hot({
						id: 'hkSetup',
						type: 'link',
						rows: 1,
						x: 2,
						w: a.length,
						href: 'https://hackatime.hackclub.com',
						label: 'set up hackatime'
					});

					hot({
						id: 'hkVideo',
						type: 'link',
						rows: 1,
						x: 2 + a.length + 2,
						w: b.length,
						href: 'https://www.youtube.com/watch?v=grriwsX5mIo',
						label: 'watch the hackatime setup video'
					});

					row([
						...s(a, hovered === 'hkSetup' ? 'hov' : 'c2'),
						...s('  '),
						...s(b, hovered === 'hkVideo' ? 'hov' : 'c2')
					]);
				}

				blank();
				row(s('tracked a little time already?', 'c1'));
				// '»' not '↻' - the refresh arrow isn't in JetBrains Mono (drift!)
				const lbl = finding.showing ? '[ » looking for you... ]' : '[ » look for my hackatime ]';
				hot({
					id: 'findHackatime',
					type: 'findHackatime',
					rows: 1,
					x: 2,
					w: lbl.length,
					label: lbl
				});

				row(s(lbl, hovered === 'findHackatime' ? 'hov' : 'c2'));
			} else if (nothingTracked) {
				blank();
				ctr('nothing tracked yet - hack a little with hackatime running,', 'c1');
				ctr('then refresh this page. your projects will show up here!', 'c1');
				blank();
				{
					const lbl = '[ hackatime setup guide ↗ ]';
					const x = ctr(lbl, hovered === 'hkGuide' ? 'hov' : 'c2');
					hot({
						id: 'hkGuide',
						type: 'link',
						rows: 1,
						x,
						w: lbl.length,
						href: 'https://hackatime.hackclub.com/docs',
						label: 'hackatime setup guide',
						row: rows.length - 1
					});
				}

				blank();
			} else {
				// ONE stable, scrollable list - rows never move when toggled
				{
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
							label: `${k.linked ? 'deselect' : 'select'} ${k.key}`
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
				}

				// "/" search under the list - full-width box-drawing input field;
				// the DOM <input> overlays the middle row
				if (availableKeys.length > 0) {
					const boxW = inner;
					const border = searchFocused ? 'c2' : '';
					row(s(`╭${'─'.repeat(boxW - 2)}╮`, border));
					searchRow = rows.length;
					row([{ ch: '│', cls: border }, ...s(' / ', 'c2'), ...s(' '.repeat(boxW - 5)), { ch: '│', cls: border }]);

					row(s(`╰${'─'.repeat(boxW - 2)}╯`, border));
				}
			}

			blank();

			// confirm the selection - greyed out until at least one key is picked;
			// this SAVES the staged selection, so it locks while the save runs
			btnBand([
				{
					id: 'confirm',
					label: confirmingSel.showing ? 'confirming...' : '▸ confirm selection',
					type: 'confirm',
					primary: true,
					disabled: staged.length === 0 || confirmingSel.active,
					fullWidth: true
				}
			]);

			blank();
		} // end of the blocking hackatime step

		// ── SCORE - a game-style scorecard: one big level, one bar, a few
		// chips. less dashboard, more Balatro. ───────────────────────────
		if (confirmed) {
			rule('score', `LVL ${project.level} · ${fmtN(project.score)}`);
			blank();
			{
				const cur = levels.find((l) => l.level === project.level) ?? levels[0];
				const next = levels.find((l) => l.level === project.level + 1);

				const UNITS: Record<string, string> = {
					npm: 'npm downloads',
					pypi: 'PyPI downloads',
					crates: 'cargo downloads',
					chrome_ext: 'Chrome installs',
					firefox_addon: 'Firefox installs'
				};

				const repoSrc = sources.find((x) => x.kind === 'github_repo');
				const demoSrc = sources.find((x) => x.kind in UNITS);

				// the pitch, up front: what to actually go get
				row([
					...s('want more ', 'c3'),
					...s('✶ sparks', 'c2'),
					...s('? get more: ', 'c3'),
					...s(`GitHub stars${demoSrc ? `, ${UNITS[demoSrc.kind]}` : ''}!`, 'c2')
				]);

				blank();

				// the one payoff line - flat sparks, never rates
				const approvedHours = ships
					.filter((sh) => sh.status === 'approved')
					.reduce((a, sh) => a + (sh.hoursAssigned ?? 0), 0);

				const bonus = next ? Math.round(approvedHours * (next.rate - cur.rate) * 100) / 100 : 0;
				const payoff: Cell[] = next
					? bonus > 0
						? [...s('next level: ', 'c3'), ...s(`+${fmtSparks(bonus)} ✶`, 'c2')]
						: next.rate > cur.rate
							? [...s('next level: ', 'c3'), ...s('bigger payouts!', 'c2')]
							: s(`next level: LVL ${next.level}`, 'c3')
					: s('MAX LEVEL - white-hot!', 'c2');

				// one dim hint (swapped for a note when something needs saying)
				const earned = [...levels].reverse().find((l) => project.score >= l.minScore);
				let hint: Cell[] = s('more users = more ✶ - get it out there!', 'c1');
				if (project.scoreFlagged) {
					hint = s('score frozen while we check a growth spike!', 'c2');
				} else if (earned && earned.level > project.level && earned.level > project.maxReviewedLevel) {
					hint = s('next level needs a staff look - hang tight!', 'c1');
				}

				// level on the left (accent), bar / payoff / hint stacked right
				const leftPad = 2;
				const label = `LVL ${project.level}`;
				const rightX = leftPad + label.length + 3;
				const r0right = next ? `  ${fmtN(project.score)} / ${fmtN(next.minScore)}` : '';
				const barW = Math.max(10, inner - rightX - 2 - r0right.length - 1);
				const span = next ? Math.max(1, next.minScore - cur.minScore) : 1;
				const frac = next ? Math.max(0, Math.min(1, (project.score - cur.minScore) / span)) : 1;
				const filled = Math.round(frac * barW);
				const barRow: Cell[] = [
					{ ch: '[', cls: '' },
					...s('█'.repeat(filled), 'c2'),
					...s('░'.repeat(barW - filled), ''),
					{ ch: ']', cls: '' },
					...s(r0right, 'c1')
				];

				const rightRows = [barRow, payoff, hint];
				for (let r = 0; r < 3; r++) {
					row([
						...s(' '.repeat(leftPad)),
						...s(r === 0 ? label : ' '.repeat(label.length), 'c2'),
						...s('   '),
						...rightRows[r]
					]);
				}

				blank();

				// tiny chips: where the score comes from + what it already paid
				const chip = (parts: Cell[]): Cell[] => [...s('( '), ...parts, ...s(' )')];
				const chips: Cell[][] = [];
				if (repoSrc) {
					chips.push(
						chip([
							...s(`+${fmtN(repoSrc.score)}`, repoSrc.score > 0 ? 'c2' : 'c1'),
							...s(` from GitHub stars!${repoSrc.verified ? '' : ' · unverified'}`, 'c1')
						])
					);
				}

				if (demoSrc) {
					chips.push(
						chip([
							...s(`+${fmtN(demoSrc.score)}`, demoSrc.score > 0 ? 'c2' : 'c1'),
							...s(` from ${UNITS[demoSrc.kind]}${demoSrc.verified ? '' : ' · unverified'}`, 'c1')
						])
					);
				}

				if (scoreSparks > 0) {
					chips.push(chip([...s(`+${fmtSparks(scoreSparks)} ✶`, 'c2'), ...s(' earned so far', 'c1')]));
				}

				if (chips.length === 0) {
					chips.push(chip(s('link a repo to start scoring', 'c1')));
				}

				// chips flow left to right, wrapping onto new rows as needed
				let line: Cell[] = s(' '.repeat(leftPad));
				for (const c of chips) {
					if (line.length > leftPad && line.length + 2 + c.length > inner) {
						row(line);
						line = s(' '.repeat(leftPad));
					}

					if (line.length > leftPad) {
						line.push(...s('  '));
					}

					line.push(...c);
				}

				if (line.length > leftPad) {
					row(line);
				}

				blank();
			}

			// ── quests - one-time bounties for getting it out there ───────
			rule('quests', `${quests.completed.length}/${quests.catalog.length}`);
			blank();
			row(s('lil sparks for getting your project out there:', 'c1'));
			blank();
			if (!quests.unlocked) {
				row(s('quests unlock after your first approved ship!', 'c1'));
			} else {
				for (const q of quests.catalog) {
					const done = quests.completed.includes(q.id);
					const right = s(`+${q.sparks} ✶`, done ? 'c1' : 'c2');
					if (done) {
						row([...s('[x] ', 'c2'), ...s(q.title, 'c1')], right);
						continue;
					}

					const id = `quest:${q.id}`;
					hot({ id, type: 'quest', rows: 1, x: 2, w: inner, questId: q.id, label: q.title });
					const hov = hovered === id;
					row([...s('[ ] ', hov ? 'hov' : ''), ...s(q.title, hov ? 'hov' : 'c3')], right);
				}
			}

			blank();
		}

		// ── timeline (stemmed tree) ───────────────────────────────────────
		if (confirmed && ships.length > 0) {
			rule('timeline');
			blank();
			const ordered = [...ships].reverse();
			ordered.forEach((sh, i) => {
				const isLastShip = i === ordered.length - 1;
				// ✓ green = approved, ✗ red = rejected, ● dim = everything else
				const node =
					sh.status === 'approved'
						? { ch: '✓', cls: 'ok' }
						: sh.status === 'rejected'
							? { ch: '✗', cls: 'c2' }
							: sh.status === 'cancelled'
								? { ch: '·', cls: 'c1' }
								: { ch: '●', cls: 'c1' };

				const statusCls = sh.status === 'approved' ? 'ok' : sh.status === 'rejected' ? 'c2' : 'c1';
				row(
					[
						{ ch: node.ch, cls: node.cls },
						{ ch: ' ', cls: '' },
						...s(fmtD(sh.submittedAt), 'c1'),
						...s(`  ship #${sh.shipNumber} · ${fmtHM(sh.secondsSubmitted)}`, 'c3'),
						...(sh.hoursAssigned != null ? s(`  → ${sh.hoursAssigned}h approved`, 'c1') : [])
					],
					s(statusLabel[sh.status] ?? sh.status, statusCls)
				);
				// decisions (approval/rejection) always show, even with no
				// feedback text - a silent NEEDS CHANGES row reads like a bug
				const fbs = reviews.filter(
					(r) => r.shipId === sh.id && (r.feedback || r.kind === 'rejection' || r.kind === 'approval')
				);

				fbs.forEach((r, j) => {
					const lastFb = j === fbs.length - 1;
					const branch = lastFb && isLastShip ? '╰─ ' : '├─ ';
					const cont = lastFb && isLastShip ? '   ' : '│  ';
					const kindCls = r.kind === 'approval' ? 'ok' : r.kind === 'rejection' ? 'c2' : 'c1';
					// the kind on its own line; the message indented underneath,
					// markdown-styled, with the author's linebreaks respected
					row([...s(branch, ''), ...s(`${r.kind}:`, kindCls)]);
					const indent = cont + '  ';
					const maxW = inner - indent.length - 2;
					for (const para of (r.feedback || '(no feedback left)').split('\n')) {
						if (!para.trim()) {
							row(s(cont));
							continue;
						}

						for (const line of wrapFCells(mdCells(para), maxW)) {
							const rowIdx = rows.length;
							// clickable runs -> hotspots; hovered links paint inverted
							let k = 0;
							while (k < line.length) {
								const href = line[k].href;
								if (!href) {
									k++;
									continue;
								}

								const start = k;
								while (k < line.length && line[k].href === href) k++;
								const id = `fb:${r.id}:${rowIdx}:${start}`;
								if (hovered === id) {
									for (let q = start; q < k; q++) line[q] = { ...line[q], cls: 'hov' };
								}

								hot({
									id,
									type: 'link',
									rows: 1,
									x: 2 + indent.length + start,
									w: k - start,
									href,
									label: href
								});
							}

							row([...s(indent, ''), ...line]);
						}
					}
				});

				if (!isLastShip) {
					row(s('│', ''));
				}
			});

			blank();
		}

		rows.push([...s('╰'), ...s('─'.repeat(W - 2)), ...s('╯')]);
		return { rows, hotspots, searchRow };
	});

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

	onMount(() => {
		function measure() {
			if (!host) return;

			charW = measureCharWidth(cell, host);
			cols = Math.max(52, Math.floor(host.getBoundingClientRect().width / charW));
		}

		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(host!);
		return () => ro.disconnect();
	});
</script>

<div class="tui" bind:this={host} style="--fs: {cell}px; --lh: {rowH}px" onwheel={onWheel}>
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
		{:else if h.type === 'cancelShip'}
			<button
				class="hs"
				aria-label={h.label}
				{style}
				onclick={() => (cancelShipOpen = true)}
				onpointerenter={() => (hovered = h.id)}
				onpointerleave={() => (hovered = null)}
			></button>
		{:else if h.type === 'quest'}
			<button
				class="hs"
				aria-label={h.label}
				{style}
				onclick={() => {
					questPending = quests.catalog.find((q) => q.id === h.questId) ?? null;
					questProof = '';
					questError = null;
					questConfirmOpen = true;
				}}
				onpointerenter={() => (hovered = h.id)}
				onpointerleave={() => (hovered = null)}
			></button>
		{:else if h.type === 'confirm' || h.type === 'scrollUp' || h.type === 'scrollDown'}
			<button
				class="hs"
				aria-label={h.label}
				{style}
				onclick={() => (h.type === 'confirm' ? keysForm?.requestSubmit() : bumpScroll(h.type === 'scrollUp' ? -1 : 1))}
				onpointerenter={() => (hovered = h.id)}
				onpointerleave={() => (hovered = null)}
			></button>
		{:else if h.type === 'toggleKey'}
			<!-- staged locally - the confirm button saves the whole selection -->
			<button
				class="hs"
				aria-label={h.label}
				{style}
				onclick={() => h.key && toggleStaged(h.key)}
				onpointerenter={() => (hovered = h.id)}
				onpointerleave={() => (hovered = null)}
			></button>
		{:else}
			<form method="POST" action="?/findHackatime" use:enhance={withPending(finding)}>
				<button
					class="hs"
					aria-label={h.label}
					{style}
					disabled={finding.active}
					onpointerenter={() => (hovered = h.id)}
					onpointerleave={() => (hovered = null)}
				></button>
			</form>
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
</div>

<!-- the gate's "confirm selection" submits this: the staged keys, one payload.
     success dismisses the gate; failure keeps the selector open (the parent
     page renders form.error) -->
<form
	bind:this={keysForm}
	method="POST"
	action="?/setKeys"
	hidden
	use:enhance={withPending(confirmingSel, () => async ({ result, update }) => {
		await update();
		if (result.type === 'success') confirmed = true;
	})}
>
	{#each staged as key (key)}
		<input type="hidden" name="keys" value={key} />
	{/each}
</form>

<!-- submitted only via the cancel-ship confirm dialog's "yes" -->
<form
	bind:this={cancelShipForm}
	method="POST"
	action="?/cancelShip"
	hidden
	use:enhance={withPending(cancellingShip)}
></form>

<TuiConfirm
	bind:open={cancelShipOpen}
	danger
	title="cancel this ship?"
	message="your ship will be withdrawn from review so you can edit things and re-ship. no tracked time is lost!"
	yesLabel="× yes, cancel it"
	noLabel="keep it in review!"
	onyes={() => cancelShipForm?.requestSubmit()}
/>

<!-- submitted only via the quest confirm dialog's "yes" -->
<form
	bind:this={questForm}
	method="POST"
	action="?/quest"
	hidden
	use:enhance={withPending(questing, () => async ({ result, update }) => {
		if (result.type === 'failure') {
			questError = String(result.data?.error ?? 'something went wrong - try again!');
		} else {
			questError = null;
			questConfirmOpen = false;
			await update();
		}
	})}
>
	<input type="hidden" name="questId" value={questPending?.id ?? ''} />
	<input type="hidden" name="proofUrl" value={questProof} />
</form>

{#if questPending}
	<TuiConfirm
		bind:open={questConfirmOpen}
		closeOnYes={false}
		error={questError}
		title={`quest - +${questPending.sparks} ✶`}
		face="[ ^w^ ]"
		message={`${questPending.title}! ${questPending.note ?? ''}`}
		input={questPending.kind === 'share' ? 'paste the link to your post here!' : undefined}
		bind:inputValue={questProof}
		busy={questing.active}
		yesLabel={questing.showing
			? 'checking...'
			: questPending.kind === 'share'
				? '▸ submit my post'
				: questPending.kind === 'readme-mention'
					? '▸ check my README'
					: '▸ check my repo'}
		noLabel="not yet!"
		onyes={() => questForm?.requestSubmit()}
	/>
{/if}

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

		/* approvals - hack club green (the accent stays for rejections) */
		:global(.ok) {
			color: #33d6a6;
		}

		:global(.em) {
			font-style: italic;
		}

		:global(.code) {
			background: color-mix(in srgb, var(--dim) 25%, transparent);
			color: #33d6a6;
		}

		:global(.lnk) {
			color: var(--accent);
			text-decoration: underline;
			text-underline-offset: 3px;
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
</style>
