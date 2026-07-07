<script lang="ts">
	import DashboardBanner from '$lib/ascii/DashboardBanner.svelte';
	import FlameButton from '$lib/ascii/FlameButton.svelte';

	let { data } = $props();

	import type { MotdSegment } from '$lib/ascii/DashboardBanner.svelte';

	const inReview = $derived(data.projects.filter((p) => p.shipStatus === 'pending' || p.shipStatus === 'pending_hq'));

	const motd: MotdSegment[] = $derived.by(() => {
		if (data.projects.length === 0) return [{ text: 'start planning your first project below!' }];

		if (!data.hasShipped) return [{ text: 'done with a project? click on one, then ship it!' }];

		if (inReview.length > 0) {
			const segs: MotdSegment[] = [{ text: "we're currently reviewing " }];
			inReview.forEach((p, i) => {
				if (i > 0) {
					segs.push({ text: ', ' });
				}

				segs.push({ text: p.title, accent: true });
			});

			segs.push({ text: '. you can still submit more!' });
			return segs;
		}

		if (!data.hasOrdered) return [{ text: 'check out our fancy shop!' }];

		return [{ text: 'thank you for participating in anvil! ' }, { text: '<3', accent: true }];
	});

	const statusLabel: Record<string, string> = {
		draft: 'draft',
		pending: 'in review',
		pending_hq: 'in review',
		approved: 'approved',
		rejected: 'needs changes'
	};
</script>

<svelte:head>
	<title>dashboard - anvil</title>
</svelte:head>

<div class="dash">
	<DashboardBanner username={data.user.username} {motd} />

	{#if !data.user.hackatimeConnected}
		<!-- the single most important funnel step for hack club newcomers -->
		<p class="hktip">
			<span class="dim">new to hack club?</span>
			anvil rewards coding time tracked with hackatime - set it up before you start hacking so every minute counts!
			<a href="https://hackatime.hackclub.com" target="_blank" rel="noreferrer">[ set up hackatime ↗ ]</a>
			<a href="https://www.youtube.com/watch?v=grriwsX5mIo" target="_blank" rel="noreferrer">
				[ watch the setup video ↗ ]
			</a>
		</p>
	{/if}

	{#if data.projects.length === 0}
		<!-- the whole empty state - heading included - lives in ONE ascii host -->
		<FlameButton
			heading="~/projects"
			intro={"hiya! looks like you haven't created any projects on anvil yet.\nlet's get started!"}
			label="[ + create new project ]"
			outro="we'll guide you through making one!"
			href="/projects/new"
		/>
	{:else}
		<div class="head">
			<h1>
				<span class="dim">~/</span>
				projects
			</h1>
			<a class="new" href="/projects/new">[ + new project ]</a>
		</div>
		<ul class="projects">
			{#each data.projects as p (p.id)}
				<li>
					<a href={`/projects/${p.id}`}>
						<span class="title">{p.title}</span>
						<span class="status" data-status={p.shipStatus}>{statusLabel[p.shipStatus]}</span>
						{#if p.locked}<span class="locked">locked</span>{/if}
						<span class="tier dim">LVL {p.level}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.dash {
		display: flex;
		flex-direction: column;
		gap: 1.75rem;

		/* banner butts up against the topbar/nag, swallowing main's top padding */
		:global(.banner) {
			margin-top: -2.5rem;
		}
	}

	.hktip {
		border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
		padding: 0.75rem 2ch;
		line-height: 1.7;

		a {
			color: var(--accent);
			white-space: nowrap;

			&:hover {
				background: var(--accent);
				color: var(--bg);
			}
		}
	}

	.head {
		display: flex;
		align-items: baseline;
		gap: 2rem;
	}

	h1 {
		font-size: var(--fs-lg);
		font-weight: 400;
	}

	.new {
		color: var(--accent);

		&:hover {
			background: var(--accent);
			color: var(--bg);
		}
	}

	.projects {
		list-style: none;
		display: flex;
		flex-direction: column;

		a {
			display: flex;
			gap: 1.5ch;
			align-items: baseline;
			padding: 0.7rem 0.5ch;
			color: var(--text);
			border-bottom: 1px solid color-mix(in srgb, var(--dim) 35%, transparent);

			&:hover .title {
				color: var(--accent);
			}
		}
	}

	.title {
		font-weight: 700;
	}

	.status {
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--dim);

		&[data-status='approved'] {
			color: var(--accent);
		}
	}

	.locked {
		font-size: var(--fs-xs);
		color: var(--accent);
		border: 1px solid var(--accent);
		padding: 0 0.5ch;
	}

	.tier {
		margin-left: auto;
	}

	.dim {
		color: var(--dim);
	}
</style>
