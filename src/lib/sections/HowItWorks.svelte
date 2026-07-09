<script lang="ts">
	import AsciiPanels from '$lib/ascii/AsciiPanels.svelte';

	// rendered as a uniform, grid-aligned monospace transcript so it reads as
	// part of the ASCII cloud. leading spaces are literal (white-space: pre).
	const lines: { c: string; t?: string; n?: string }[] = [
		{ c: 'head', t: '// how it works' },
		{ c: 'gap' },
		{ c: 'cmd', n: '01', t: 'forge' },
		{ c: 'out', t: '  build something to help hackers hack.' },
		{ c: 'out', t: '  libraries, tools, guides...' },
		{ c: 'gap' },
		{ c: 'cmd', n: '02', t: 'ship' },
		{ c: 'out', t: "  ship it! you'll get a base prize for that." },
		{ c: 'gap' },
		{ c: 'cmd', n: '03', t: 'earn' },
		{ c: 'out', t: '  as people use it, you unlock better prizes!!' },
		{ c: 'gap' },
		{ c: 'end' }
	];
</script>

<section class="how" id="how" data-no-smoke>
	<div class="panelsbg" data-ascii-cave>
		<AsciiPanels />
	</div>
	<div class="wrap" data-panel-mask>
		<div class="transcript" aria-label="how it works">
			{#each lines as l, i (i)}
				{#if l.c === 'cmd'}
					<div class="line">
						<span class="p">{l.n}</span>
						<span class="sep">::</span>
						{l.t}
					</div>
				{:else if l.c === 'out'}
					<div class="line out">{l.t}</div>
				{:else if l.c === 'head'}
					<div class="line head">{l.t}</div>
				{:else if l.c === 'end'}
					<div class="line">
						<span class="p">$</span>
						<span class="caret">_</span>
					</div>
				{:else}
					<div class="line">&nbsp;</div>
				{/if}
			{/each}
		</div>
	</div>
</section>

<style>
	.how {
		position: relative;
		min-height: 118svh;
		display: grid;
		place-items: center;
		padding-block: clamp(4rem, 12vh, 9rem);
		overflow: hidden;
	}

	/* 3D panels fill the whole section (curve to curve), behind the content */
	.panelsbg {
		position: absolute;
		inset: 0;
		z-index: 0;
		opacity: 0.55;
	}

	/* shrink to the text so the mask hugs the content; mask adds the 1-char pad */
	.wrap {
		position: relative;
		z-index: 1;
		width: fit-content;
		max-width: 92vw;
		padding: 0;
	}

	.transcript {
		font-size: var(--fs-md);
		line-height: 1.55;
	}

	.line {
		white-space: pre;
		color: var(--text);

		&.head {
			color: var(--accent);
		}

		&.out {
			opacity: 0.78;
		}
	}

	.p {
		color: var(--accent);
		font-weight: 700;
	}

	.sep {
		color: var(--dim);
	}

	.caret {
		color: var(--accent);
		animation: blink 1s steps(1) infinite;
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}

	/* narrow screens: the fixed-width monospace transcript no longer fits, so let
	   the copy wrap and full-bleed the wrap to the viewport edges. the rift is
	   carved around [data-panel-mask], so widening it makes the rift extend
	   across the full width - the same full-bleed vein as "what you can get". */
	@media (max-width: 34rem) {
		.wrap {
			width: 100%;
			max-width: none;
			justify-self: stretch;
			padding-inline: var(--gutter);
		}

		/* normal (not pre-wrap) so the literal leading spaces collapse away -
		   the "output" indentation reads as clutter once the lines wrap */
		.line {
			white-space: normal;
		}

		/* flow consecutive output lines together as one wrapping paragraph,
		   disregarding the authored line breaks between them */
		.line.out {
			display: inline;
		}

		.line.out::after {
			content: ' ';
		}
	}
</style>
