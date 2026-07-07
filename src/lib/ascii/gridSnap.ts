// Svelte action: nudges an element left so its border-box edge sits exactly on
// a column of the fixed background char grid. With the content set in the same
// mono font at the grid's cell size (and ch-based padding), every DOM glyph
// then registers with a background column - the text sits ON the terminal grid.
import { cfg } from './config.svelte';
import { measureCharWidth } from './measureChar';

export function gridSnap(node: HTMLElement) {
	function apply() {
		const w = measureCharWidth(cfg.cell);
		node.style.transform = '';
		const left = node.getBoundingClientRect().left;
		const dx = ((left % w) + w) % w;
		if (dx > 0.01 && dx < w - 0.01) {
			node.style.transform = `translateX(${-dx}px)`;
		}
	}

	apply();
	const ro = new ResizeObserver(apply);
	ro.observe(document.documentElement);
	return {
		destroy() {
			ro.disconnect();
		}
	};
}
