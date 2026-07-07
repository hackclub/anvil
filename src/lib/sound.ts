// Tiny UI sound kit. click = any non-navigating button press; danger = the
// destructive confirms. Buttons opt out with data-sound="none" (full-page
// form posts, where the reload would cut the sound off anyway) and opt into
// danger with data-sound="danger".
let click: HTMLAudioElement | null = null;
let danger: HTMLAudioElement | null = null;

function play(el: HTMLAudioElement, rate = 1) {
	el.currentTime = 0;
	// tape-style pitch shift: let playbackRate bend the pitch too
	el.preservesPitch = rate === 1;
	el.playbackRate = rate;
	el.play().catch(() => {
		// autoplay policy or missing device - sounds are decoration, not state
	});
}

export function playClick(rate = 1): void {
	click ??= new Audio('/audio/click.wav');
	play(click, rate);
}

export function playDanger(): void {
	danger ??= new Audio('/audio/negative.wav');
	play(danger);
}

/** The ship fanfare: ~500ms riser, then impact. ogg with an mp3 fallback
 *  (Safari). Returns the element so callers can sync animation to it. */
export function playShipped(): HTMLAudioElement {
	const el = new Audio();
	el.src = el.canPlayType('audio/ogg; codecs=vorbis') ? '/audio/shipped.ogg' : '/audio/shipped.mp3';
	el.play().catch(() => {
		// direct visits without a prior gesture may be blocked - fine
	});

	return el;
}

/** Delegated capture handler - wire once on a layout root. EVERYTHING
 *  clickable clicks - buttons, links (even redirecting ones), disclosure
 *  toggles. data-sound="none" stays as an escape hatch. */
export function soundOnClick(e: MouseEvent): void {
	const el = (e.target as HTMLElement | null)?.closest?.('button, summary, a');
	if (!el) return;

	if (window.location.pathname.startsWith('/admin')) return;

	const kind = (el as HTMLElement).dataset.sound;
	if (kind === 'none') return;

	if (kind === 'danger') {
		playDanger();
	} else if (kind === 'back') {
		// dismissals ("not yet!", "keep it!") get the pitched-down click
		playClick(0.8);
	} else if (el.tagName === 'SUMMARY') {
		// at capture time <details> still holds the OLD state: open means
		// this click collapses it - play the slightly pitched-down click
		playClick(el.closest('details')?.open ? 0.8 : 1);
	} else {
		playClick();
	}
}
