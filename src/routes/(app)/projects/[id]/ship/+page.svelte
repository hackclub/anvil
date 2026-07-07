<script lang="ts">
	import DemoExplainer from '$lib/components/DemoExplainer.svelte';
	import ShipTui from '$lib/ascii/ShipTui.svelte';

	let { data, form } = $props();

	let explainerOpen = $state(false);
</script>

<svelte:head>
	<title>ship {data.project.title} - anvil</title>
</svelte:head>

<div class="ship">
	<p class="back">
		<a href={`/projects/${data.project.id}`}>← back to {data.project.title}</a>
	</p>

	<ShipTui
		project={data.project}
		checks={data.checks}
		totalSeconds={data.totalSeconds}
		blocked={data.blocked}
		error={form?.error}
		onexplain={() => (explainerOpen = true)}
	/>
</div>

<DemoExplainer bind:open={explainerOpen} />

<style>
	/* TUI rule: one font size everywhere */
	.ship {
		max-width: 100ch;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		font-size: var(--fs-md);
	}

	.back a {
		color: var(--dim);

		&:hover {
			color: var(--accent);
		}
	}
</style>
