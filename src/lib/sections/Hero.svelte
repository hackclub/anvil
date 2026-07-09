<script lang="ts">
	import TerminalButton from '$lib/components/TerminalButton.svelte';
	import RotatingWord from '$lib/components/RotatingWord.svelte';

	const tools = ['tool', 'guide', 'library'];
	const prizes = ['licenses', 'subscriptions', 'devtools'];
</script>

<section class="hero" id="top">
	<!-- The ASCII field draws this card's frame (+ credit) directly onto its
	     character grid, so the box meshes with the shader. The interactive
	     content below stays in the DOM, on top. -->
	<div class="card" data-ascii-void>
		<p class="sr-only">by @ascpixi for Hack Club, with love</p>
		<p class="intro">&lt;anvil by hack club&gt;</p>
		<h1 class="tagline">
			ship a <RotatingWord words={tools} />
			<span class="sep">//</span>
			we ship you
			<RotatingWord words={prizes} delay={1400} />
		</h1>
		<p class="sub">
			build anything that helps other hackers make cool stuff. the more it gets
			<span class="accent">used</span>, the better your reward gets.
		</p>
		<div class="cta">
			<TerminalButton label="> enter platform" variant="primary" href="/auth/login" />
			<TerminalButton label="how it works" href="#how" />
		</div>
	</div>
</section>

<style>
	.hero {
		position: relative;

		/* leave room so the labeled "scroll" divider peeks above the fold */
		min-height: calc(100svh - 6rem);
		display: grid;
		place-items: center;
		isolation: isolate;
	}

	.card {
		position: relative;
		z-index: 2;
		width: min(90vw, 600px);

		/* padding keeps content clear of the frame the shader draws at our edges */
		padding: 2.1rem clamp(1.5rem, 4vw, 2.75rem) 1.9rem;
		text-align: left;
	}

	/* all hero copy is exactly one size (--fs-md) - terminal-uniform */
	/* inverse-video label - a real-terminal way to stand out without a size change */
	.intro {
		font-size: var(--fs-md);
		font-weight: 700;
		display: inline-block;
		color: var(--bg);
		background: var(--accent);
		padding: 0 0.45em;
		margin: 0 0 1.15rem;
		text-shadow: none;
	}

	.tagline {
		font-size: var(--fs-md);
		font-weight: 400;
		line-height: 1.8;
		margin: 0 0 1rem;
	}

	.sep {
		color: var(--dim);
	}

	.sub {
		font-size: var(--fs-md);
		color: var(--text);
		opacity: 0.96;
		max-width: 52ch;
		margin: 0 0 1.75rem;
		line-height: 1.8;
	}

	.cta {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}
</style>
