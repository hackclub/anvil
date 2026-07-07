// Measures a monospace glyph's rendered width in `--font-mono` at a given
// font-size by rendering 100 copies into an invisible probe span and
// dividing - avoids the subpixel rounding a single-glyph measurement gets.
export function measureCharWidth(cell: number, container: Element = document.body): number {
	const probe = document.createElement('span');
	probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:var(--font-mono);font-size:${cell}px`;
	probe.textContent = 'M'.repeat(100);
	container.appendChild(probe);
	const width = probe.getBoundingClientRect().width / 100;
	probe.remove();
	return width;
}
