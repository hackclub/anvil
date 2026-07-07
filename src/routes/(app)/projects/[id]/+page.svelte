<script lang="ts">
	import ProjectTui, { type KeyInfo } from '$lib/ascii/ProjectTui.svelte';

	let { data, form } = $props();

	const linkedKeys: KeyInfo[] = $derived(
		data.keys.map((k) => ({
			key: k,
			seconds: data.keySeconds.find((s) => s.key === k)?.seconds ?? 0
		}))
	);
	// ALL of the user's hackatime projects - the TUI renders one stable list
	// (linked, unlinked, and assigned-elsewhere keys keep their positions)
	const availableKeys: KeyInfo[] = $derived(
		data.availableKeys.map((ak) => ({ key: ak.name, seconds: ak.total_seconds }))
	);
</script>

<svelte:head>
	<title>{data.project.title} - anvil</title>
</svelte:head>

<div class="page">
	<p class="back">
		<a href="/dashboard">← ~/projects</a>
	</p>

	{#if data.hackatimeError}<p class="error">! {data.hackatimeError}</p>{/if}
	{#if form?.error}<p class="error">! {form.error}</p>{/if}

	<ProjectTui
		project={data.project}
		{linkedKeys}
		{availableKeys}
		levels={data.levels}
		quests={data.quests}
		sources={data.sources}
		ships={data.ships}
		reviews={data.reviews}
		minShipSeconds={data.minShipSeconds}
		hasHackatime={data.user.hackatimeConnected}
		lastShipSparks={data.lastShipSparks}
		scoreSparks={data.scoreSparks}
		assignedElsewhere={data.assignedElsewhere}
	/>
</div>

<style>
	/* TUI rule: one font size everywhere */
	.page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		font-size: var(--fs-md);
	}

	.back a {
		color: var(--dim);

		&:hover {
			color: var(--accent);
		}
	}

	.error {
		color: var(--accent);
	}
</style>
