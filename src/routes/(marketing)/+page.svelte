<script lang="ts">
	import Hero from '$lib/sections/Hero.svelte';
	import HowItWorks from '$lib/sections/HowItWorks.svelte';
	import Rewards from '$lib/sections/Rewards.svelte';
	import Faq from '$lib/sections/Faq.svelte';
	import SignUp from '$lib/sections/SignUp.svelte';
	import Footer from '$lib/sections/Footer.svelte';
	import AsciiDivider from '$lib/ascii/AsciiDivider.svelte';
	import AsciiRings from '$lib/ascii/AsciiRings.svelte';
	import { PROGRAM_CLOSED } from '$lib/config/season';

	const title = PROGRAM_CLOSED ? 'Anvil - this program has ended' : 'Anvil - ship a tool, we ship you prizes';
	const description = PROGRAM_CLOSED
		? 'Anvil has ended. Submissions, shipping, and signups are closed - thank you to everyone who built with us.'
		: "Anvil is a Hack Club YSWS. Build a tool that helps other hackers, ship it, and earn prizes that get better the more it's used.";
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="https://anvil.hackclub.com/" />
	<meta property="og:url" content="https://anvil.hackclub.com/" />
	{@html `<script type="application/ld+json">${JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: 'Anvil',
		url: 'https://anvil.hackclub.com/',
		description,
		publisher: {
			'@type': 'Organization',
			name: 'Hack Club',
			url: 'https://hackclub.com/',
			logo: 'https://assets.hackclub.com/icon-rounded.png'
		}
	})}</script>`}
</svelte:head>

<Hero />
<AsciiDivider label="scroll ▼" />
<HowItWorks />
<AsciiDivider />
<Rewards />
<AsciiDivider />
<Faq />
<AsciiDivider />
<!-- no cursor smoke here - the cursor interacts with the rings instead -->
<div class="finale" data-no-smoke>
	<div class="finale-bg" data-ascii-cave aria-hidden="true">
		<AsciiRings centerYFrac={0.34} />
	</div>
	<SignUp />
	<Footer />
</div>

<style>
	.finale {
		position: relative;
	}

	/* rings sit behind BOTH the sign-up section and the footer */
	.finale-bg {
		position: absolute;
		inset: 0;
		z-index: 0;
		opacity: 0.5;
		pointer-events: none;

		/* no top fade - the divider curve overwrites the seam cleanly;
		   the footer's gradient handles the bottom fade to black */
	}
</style>
