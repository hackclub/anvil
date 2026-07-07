<script lang="ts">
	import FooterNoise from '$lib/ascii/FooterNoise.svelte';

	const columns = [
		{
			title: 'anvil',
			links: [
				{ label: 'what is anvil', href: '#top' },
				{ label: 'how it works', href: '#how' },
				{ label: 'faq', href: '#faq' }
			]
		},
		{
			title: 'resources',
			links: [
				{ label: 'join our slack', href: 'https://hackclub.com/slack' },
				{ label: 'community events', href: 'https://events.hackclub.com/' },
				{ label: 'workshops', href: 'https://workshops.hackclub.com/' },
				{ label: 'code of conduct', href: 'https://hackclub.com/conduct/' }
			]
		},
		{
			title: 'hack club',
			links: [
				{ label: 'philosophy', href: 'https://hackclub.com/philosophy/' },
				{ label: 'our team & board', href: 'https://hackclub.com/team/' },
				{ label: 'branding', href: 'https://hackclub.com/brand/' },
				{ label: 'donate', href: 'https://hackclub.com/philanthropy/' }
			]
		}
	];
</script>

<footer class="footer">
	<FooterNoise />
	<div class="wrap inner">
		<p class="lead">
			a project by
			<a class="hc" href="https://hackclub.com" target="_blank" rel="noreferrer">Hack Club</a>
		</p>

		<p class="blurb">
			Hack Club is a 501(c)(3) nonprofit and network of 60k+ technical high schoolers. We believe you learn best by
			building, so we're creating community and providing grants so you can make awesome projects. At Hack Club,
			students aren't just learning - they're
			<span class="accent">shipping</span>
			.
		</p>

		<div class="cols">
			{#each columns as col (col.title)}
				<nav class="col">
					<h3>{col.title}</h3>
					{#each col.links as l (l.label)}
						<a href={l.href}>{l.label}</a>
					{/each}
				</nav>
			{/each}
		</div>
	</div>
</footer>

<style>
	.footer {
		position: relative;
		z-index: 1;

		/* exponential-ish fade: quick drop to ~25% ring visibility, then a long
		   slow tail to fully black - so faint rings linger through the footer */
		background: linear-gradient(
			to bottom,
			rgba(0, 0, 0, 0) 0%,
			rgba(0, 0, 0, 0.75) 14%,
			rgba(0, 0, 0, 0.85) 38%,
			rgba(0, 0, 0, 0.94) 68%,
			rgba(0, 0, 0, 1) 100%
		);
		padding-top: 8vh;
		padding-bottom: 6rem;
	}

	.wrap.inner {
		position: relative;
		z-index: 1;
	}

	.lead {
		font-size: var(--fs-lg);
		font-weight: 700;
		color: var(--text);
		margin-bottom: 1.25rem;
	}

	.hc {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.blurb {
		font-size: var(--fs-sm);
		color: var(--text);
		opacity: 0.75;
		line-height: 1.7;
		max-width: 62ch;
		margin-bottom: 2.5rem;
	}

	.cols {
		display: flex;
		gap: clamp(2rem, 8vw, 6rem);
		flex-wrap: wrap;
	}

	.col {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;

		h3 {
			font-size: var(--fs-sm);
			color: var(--accent);
			text-transform: lowercase;
			margin-bottom: 0.35rem;
		}

		a {
			font-size: var(--fs-sm);
			color: var(--dim);
			transition: color 0.12s ease;

			&:hover {
				color: var(--text);
			}
		}
	}
</style>
