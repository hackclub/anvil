<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>admin/projects - anvil</title>
</svelte:head>

<div class="projects">
	<form method="GET" class="search">
		<input name="q" value={data.q} placeholder="search title" />
		<button type="submit">[ grep ]</button>
	</form>

	<table>
		<thead>
			<tr>
				<th>title</th>
				<th>owner</th>
				<th>status</th>
				<th>score</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.projects as p (p.id)}
				<tr>
					<td>
						{p.title}
						{#if p.locked}<span class="tag">locked</span>{/if}
						{#if p.scoreFlagged}<span class="tag flag">⚑</span>{/if}
						{#if p.deletedAt}<span class="tag">deleted</span>{/if}
					</td>
					<td class="dim">{p.ownerEmail}</td>
					<td class="dim">{p.shipStatus}</td>
					<td class="dim">LVL{p.level} · {p.score}</td>
					<td>
						<a href={`/admin/projects/${p.id}`}>[ inspect ]</a>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.projects {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		font-size: var(--fs-sm);
	}

	.search {
		display: flex;
		gap: 1ch;
	}

	input {
		background: var(--bg-soft);
		border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);
		color: var(--text);
		font: inherit;
		font-size: var(--fs-sm);
		padding: 0.3rem 1ch;
		width: 40ch;
	}

	button {
		background: none;
		border: 1px solid var(--dim);
		color: var(--dim);
		font: inherit;
		font-size: var(--fs-sm);
		padding: 0.25rem 1ch;
		cursor: pointer;
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

	.tag {
		font-size: var(--fs-xs);
		border: 1px solid var(--dim);
		color: var(--dim);
		padding: 0 0.5ch;
		margin-left: 1ch;

		&.flag {
			color: var(--accent);
			border-color: var(--accent);
		}
	}

	.dim {
		color: var(--dim);
	}
</style>
