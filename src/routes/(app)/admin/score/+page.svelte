<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>admin/score - anvil</title>
</svelte:head>

<div class="score">
	{#if data.queue.length === 0}
		<p class="dim">nothing needs attention - no flags, no pending level sign-offs.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>project</th>
					<th>owner</th>
					<th>score</th>
					<th>applied</th>
					<th>earned</th>
					<th>state</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.queue as p (p.id)}
					<tr>
						<td>{p.title}</td>
						<td class="dim">{p.ownerEmail}</td>
						<td>{p.score}</td>
						<td class="dim">LVL {p.level} (max {p.maxReviewedLevel})</td>
						<td>LVL {p.earnedLevel}</td>
						<td>
							{#if p.scoreFlagged}<span class="flag">⚑ velocity flag</span>{/if}
							{#if p.needsSignoff}<span class="dim">needs sign-off</span>{/if}
						</td>
						<td>
							<a href={`/admin/projects/${p.id}`}>[ review ]</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.score {
		font-size: var(--fs-sm);
	}

	table {
		border-collapse: collapse;
		width: 100%;
	}

	th {
		text-align: left;
		color: var(--dim);
		font-weight: 400;
		padding: 0.3rem 1ch;
		border-bottom: 1px solid var(--dim);
	}

	td {
		padding: 0.45rem 1ch;
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 25%, transparent);

		a {
			color: var(--accent);
		}
	}

	.flag {
		color: var(--accent);
	}

	.dim {
		color: var(--dim);
	}
</style>
