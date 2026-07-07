<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>admin/jobs - anvil</title>
</svelte:head>

<div class="jobs">
	<section>
		<h2>
			<span class="dim">//</span>
			unified ysws db syncs
		</h2>
		{#if data.syncs.length === 0}
			<p class="dim">no approved ships yet - nothing to sync.</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th>project</th>
						<th>status</th>
						<th>attempts</th>
						<th>record</th>
						<th>error</th>
					</tr>
				</thead>
				<tbody>
					{#each data.syncs as s (s.id)}
						<tr>
							<td>{s.projectTitle}</td>
							<td class:bad={s.status === 'failed'} class:good={s.status === 'synced'}>
								{s.status}
							</td>
							<td class="dim">{s.attempts}</td>
							<td class="dim">{s.airtableRecordId ?? '-'}</td>
							<td class="dim err">{s.lastError ?? ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<section>
		<h2>
			<span class="dim">//</span>
			erroring traction sources
		</h2>
		{#if data.erroringSources.length === 0}
			<p class="dim">all pollers healthy.</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th>project</th>
						<th>source</th>
						<th>errors</th>
						<th>last polled</th>
					</tr>
				</thead>
				<tbody>
					{#each data.erroringSources as s (s.id)}
						<tr>
							<td>{s.projectTitle}</td>
							<td>{s.kind}:{s.externalRef}</td>
							<td class="bad">{s.errorCount}</td>
							<td class="dim">{s.lastPolledAt?.slice(0, 16) ?? '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
</div>

<style>
	.jobs {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		font-size: var(--fs-sm);
	}

	h2 {
		font-size: var(--fs-md);
		font-weight: 400;
		margin-bottom: 0.75rem;
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
	}

	.bad {
		color: var(--accent);
	}

	.good {
		color: var(--accent);
	}

	.err {
		font-size: var(--fs-xs);
		max-width: 40ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dim {
		color: var(--dim);
	}
</style>
