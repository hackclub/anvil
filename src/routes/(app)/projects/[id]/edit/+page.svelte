<script lang="ts">
	import DemoExplainer from '$lib/components/DemoExplainer.svelte';
	import EditTui from '$lib/ascii/EditTui.svelte';

	let { data, form } = $props();

	let explainerOpen = $state(false);
</script>

<svelte:head>
	<title>edit {data.project.title} - anvil</title>
</svelte:head>

<div class="editproj">
	<p class="back">
		<a href={`/projects/${data.project.id}`}>← back to {data.project.title}</a>
	</p>

	<EditTui
		project={data.project}
		linked={data.keys}
		available={data.availableKeys.map((ak) => ({ key: ak.name, seconds: ak.total_seconds }))}
		assignedElsewhere={data.assignedElsewhere}
		error={form?.error}
		onexplain={() => (explainerOpen = true)}
	/>
</div>

<DemoExplainer bind:open={explainerOpen} />

<style>
	/* TUI rule: one font size everywhere */
	.editproj {
		max-width: 80ch;
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
