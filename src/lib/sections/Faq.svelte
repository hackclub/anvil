<script lang="ts">
	import SectionHeading from '$lib/components/SectionHeading.svelte';
	import { gridSnap } from '$lib/ascii/gridSnap';

	// answers may carry (trusted, hand-written) inline links
	const faqs = [
		{
			q: 'what counts as a "tool"?',
			a: 'Anything that helps other hackers build: a library, a CLI, an API wrapper, a design system, a really good tutorial or guide, a starter template. If it saves someone else time, it counts.'
		},
		{
			q: 'how do you measure "usage"?',
			a: 'Stars, downloads, and installs - GitHub stars, npm/PyPI/crates downloads, extension installs, that kind of thing. The more traction your project gets, the higher your prize tier.'
		},
		{
			q: 'who can join?',
			a: 'Any teen hacker, 18 and under!'
		},
		{
			q: 'is this legit?',
			a: 'Yes! Hack Club has partnered with <a href="https://stardance.hackclub.com?utm_source=anvil" target="_blank" rel="noreferrer">GitHub, AMD, and NASA</a> in the past, and we\'ve ran events like <a href="https://campfire.hackclub.com?utm_source=anvil" target="_blank" rel="noreferrer">Campfire</a>, <a href="https://midnight.hackclub.com?utm_source=anvil" target="_blank" rel="noreferrer">Midnight</a>, and <a href="https://ysws.hackclub.com?utm_source=anvil" target="_blank" rel="noreferrer">many more</a>. We get our funding from donors like Micheal Dell, Tom Preston-Werner, Tobi Lutke, and many more.'
		},
		{
			q: 'how much does it cost?',
			a: '100% free! all prizes are donated to or paid for by us!'
		},
		{
			q: 'I have other questions!',
			a: 'go ask them in our Slack channel, <a href="/help" target="_blank">#anvil-help</a>, or e-mail <a href="mailto:ascpixi@hackclub.com">ascpixi@hackclub.com</a>!'
		}
	];

	// FAQPage structured data for rich results - plain text, links stripped
	const faqLd = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faqs.map((f) => ({
			'@type': 'Question',
			name: f.q,
			acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/<[^>]+>/g, '') }
		}))
	});
</script>

<svelte:head>
	{@html `<script type="application/ld+json">${faqLd}</script>`}
</svelte:head>

<section class="faq" id="faq">
	<div class="wrap" data-no-smoke>
		<!-- grid cave: cell-aligned chamber dug into the field, breathing walls
		     drawn in the char grid itself; the Q&A stays real DOM text. one font
		     size, 2rem line grid, column-snapped to the background grid. -->
		<div class="cave" data-ascii-cave="grid" use:gridSnap>
			<SectionHeading num="03" title="faq" />

			<div class="list">
				{#each faqs as f (f.q)}
					<details>
						<summary>
							<span class="prompt">></span>
							{f.q}
							<span class="chev">+</span>
						</summary>
						<div class="answer">
							<span class="ret">↳</span>
							<!-- eslint-disable-next-line svelte/no-at-html-tags - hand-written copy above -->
							<p>{@html f.a}</p>
						</div>
					</details>
				{/each}
			</div>
		</div>
	</div>
</section>

<style>
	.faq {
		padding-block: clamp(4rem, 12vh, 8rem);
	}

	/* hug the content so the carved chamber fits the text, not the page column.
	   min-width ≈ an open answer's width so toggling doesn't re-dig the walls.
	   uniform terminal type: ONE size, lines on a 2rem grid, spacing in ch. */
	.cave {
		width: fit-content;
		margin-inline: auto;
		max-width: 100%;
		min-width: min(68ch, 100%);
		padding: 1rem 3ch;
		font-size: var(--fs-md);
		line-height: 2rem;
	}

	.list {
		border-top: 1px solid var(--dim);
	}

	details {
		border-bottom: 1px solid var(--dim);

		&[open] .chev {
			transform: rotate(45deg);
			color: var(--accent);
		}
	}

	summary {
		display: flex;
		align-items: center;
		gap: 1ch;
		padding: 0.5rem 0;
		cursor: pointer;
		list-style: none;
		color: var(--text);
		transition: color 0.12s ease;

		&::-webkit-details-marker {
			display: none;
		}

		&:hover {
			color: var(--accent);
		}
	}

	.prompt {
		color: var(--accent);
		font-weight: 700;
	}

	.chev {
		margin-left: auto;
		color: var(--dim);
		font-weight: 700;
		transition: transform 0.15s ease;
	}

	.answer {
		display: flex;
		gap: 1ch;
		padding: 0 0 1rem 0;
		color: var(--text);
		opacity: 0.82;

		p {
			max-width: 60ch;
		}

		:global(a) {
			color: var(--accent);
			text-decoration: underline;
			text-underline-offset: 3px;
		}
	}

	.ret {
		color: var(--dim);
	}
</style>
