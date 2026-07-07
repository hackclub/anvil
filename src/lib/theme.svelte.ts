// Palette definitions + a tiny reactive theme controller.
// Palette #1 (hack club red) is the default; the others are live-switchable
// via the on-page toggle (very on-brand for a terminal site).

export interface Palette {
	id: string;
	name: string;
	bg: string;
	bgSoft: string;
	text: string;
	accent: string;
	dim: string;
	/** color for the ASCII box frame; falls back to `text` if unset */
	frame?: string;
	/** extra body class for CRT glow / chroma split, if any */
	cls?: string;
}

export const palettes: Palette[] = [
	{
		id: 'red',
		name: 'hack club red',
		bg: '#17171d',
		bgSoft: '#1e1e26',
		text: '#f5f5f0',
		accent: '#ec3750',
		dim: '#5a5a66',
		frame: '#8b8b96'
	},
	{
		id: 'green',
		name: 'phosphor green',
		bg: '#000000',
		bgSoft: '#04120a',
		text: '#33ff66',
		accent: '#7dffab',
		dim: '#166b32',
		cls: 'crt'
	},
	{
		id: 'amber',
		name: 'amber mono',
		bg: '#0d0700',
		bgSoft: '#160f02',
		text: '#f4e8cf',
		accent: '#ffb000',
		dim: '#6b4a00',
		cls: 'crt'
	}
];

const STORAGE_KEY = 'anvil-theme';

function applyToDOM(p: Palette) {
	if (typeof document === 'undefined') return;

	const r = document.documentElement.style;
	r.setProperty('--bg', p.bg);
	r.setProperty('--bg-soft', p.bgSoft);
	r.setProperty('--text', p.text);
	r.setProperty('--accent', p.accent);
	r.setProperty('--dim', p.dim);
	document.body.className = p.cls ?? '';
}

class ThemeController {
	index = $state(0);

	get current(): Palette {
		return palettes[this.index];
	}

	/** Call once on mount to restore the saved palette. */
	init() {
		if (typeof localStorage === 'undefined') return;

		const saved = localStorage.getItem(STORAGE_KEY);
		const i = palettes.findIndex((p) => p.id === saved);
		if (i >= 0) {
			this.index = i;
		}

		applyToDOM(this.current);
	}

	set(i: number) {
		this.index = (i + palettes.length) % palettes.length;
		applyToDOM(this.current);
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, this.current.id);
		}
	}

	cycle() {
		this.set(this.index + 1);
	}
}

export const theme = new ThemeController();
