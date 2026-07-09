<script lang="ts">
	let { data } = $props();

	const ago = (iso: string) => {
		const secs = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
		if (secs < 60) return 'just now';

		if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;

		if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;

		if (secs < 30 * 86400) return `${Math.floor(secs / 86400)}d ago`;

		return iso.slice(0, 10);
	};

	const TYPES = ['', 'user', 'admin', 'sidekick', 'system'];
	const pageUrl = (page: number) => {
		const p = new URLSearchParams();
		if (data.q) {
			p.set('q', data.q);
		}

		if (data.type) {
			p.set('type', data.type);
		}

		if (page > 0) {
			p.set('page', String(page));
		}

		const qs = p.toString();
		return `/admin/audit${qs ? `?${qs}` : ''}`;
	};

	const lastPage = $derived(Math.max(0, Math.ceil(data.total / data.pageSize) - 1));

	const entityHref = (t: string | null, id: string | null) => {
		if (!t || !id) return null;

		if (t === 'project') return `/admin/projects/${id}`;

		return null;
	};
</script>

<svelte:head>
	<title>admin/audit - anvil</title>
</svelte:head>

<div class="audit">
	<form method="GET" class="filters">
		<input type="text" name="q" value={data.q} placeholder="search action / actor / entity id..." aria-label="search" />

		<select name="type" aria-label="actor type">
			{#each TYPES as t (t)}
				<option value={t} selected={t === data.type}>{t || 'all actors'}</option>
			{/each}
		</select>

		<button type="submit">filter</button>
		<span class="dim count">{data.total} entries</span>
	</form>

	{#if data.logs.length === 0}
		<p class="dim">nothing in the trail{data.q || data.type ? ' for this filter' : ' yet'}.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>when</th>
					<th>actor</th>
					<th>action</th>
					<th>entity</th>
					<th>data</th>
				</tr>
			</thead>
			<tbody>
				{#each data.logs as log (log.id)}
					<tr>
						<td class="dim when" title={log.createdAt}>{ago(log.createdAt)}</td>
						<td>
							<span class="who">
								{#if log.actor}
									<img
										class="avatar"
										src={log.actor.avatar}
										alt=""
										loading="lazy"
										onerror={(e) => {
											const img = e.currentTarget as HTMLImageElement;

											if (log.actor && img.src !== log.actor.avatarFallback) {
												img.src = log.actor.avatarFallback;
											}
										}}
									/>
									<span class="aname" title={log.actorId}>{log.actor.name}</span>
								{:else}
									<span
										class="atype"
										class:t-admin={log.actorType === 'admin'}
										class:t-sidekick={log.actorType === 'sidekick'}
									>
										{log.actorType}
									</span>
									{#if log.actorId}
										<span class="dim aid" title={log.actorId}>
											{log.actorId.length > 20 ? log.actorId.slice(0, 8) + '…' : log.actorId}
										</span>
									{/if}
								{/if}
							</span>
						</td>
						<td class="action">{log.action}</td>
						<td class="dim">
							{#if log.entityType}
								{@const href = entityHref(log.entityType, log.entityId)}
								{log.entityType}
								{#if href}
									<a {href}>{log.entityId?.slice(0, 8)}</a>
								{:else if log.entityId}
									<span title={log.entityId}>{log.entityId.slice(0, 8)}</span>
								{/if}
							{:else}
								-
							{/if}
						</td>
						<td class="data">
							{#if log.data}
								<details>
									<summary>{JSON.stringify(log.data).slice(0, 48)}...</summary>
									<pre>{JSON.stringify(log.data, null, 2)}</pre>
								</details>
							{:else}
								<span class="dim">-</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>

		{#if lastPage > 0}
			<nav class="pager">
				{#if data.page > 0}
					<a href={pageUrl(data.page - 1)}>« newer</a>
				{/if}

				<span class="dim">page {data.page + 1} of {lastPage + 1}</span>

				{#if data.page < lastPage}
					<a href={pageUrl(data.page + 1)}>older »</a>
				{/if}
			</nav>
		{/if}
	{/if}
</div>

<style>
	.audit {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		font-size: var(--fs-sm);
	}

	.filters {
		display: flex;
		gap: 1ch;
		align-items: baseline;
	}

	input,
	select,
	button {
		font: inherit;
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--dim);
		padding: 0.3rem 1ch;
	}

	input {
		width: 38ch;
	}

	button {
		cursor: pointer;

		&:hover {
			border-color: var(--accent);
			color: var(--accent);
		}
	}

	.count {
		margin-left: auto;
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
		padding: 0.4rem 1ch;
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 25%, transparent);
		vertical-align: top;
	}

	.when {
		white-space: nowrap;
	}

	.who {
		display: inline-flex;
		align-items: center;
		gap: 1ch;
	}

	.avatar {
		width: 1.4em;
		height: 1.4em;
		object-fit: cover;
		border: 1px solid color-mix(in srgb, var(--dim) 45%, transparent);
	}

	.atype {
		color: var(--text);
	}

	.t-admin {
		color: var(--accent);
	}

	.t-sidekick {
		color: #33d6a6;
	}

	.aname {
		color: var(--text);
	}

	.aid {
		font-size: var(--fs-xs);
	}

	.action {
		color: var(--text);
	}

	.data {
		max-width: 52ch;
	}

	summary {
		cursor: pointer;
		color: var(--dim);
		font-size: var(--fs-xs);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		list-style: none;

		&::-webkit-details-marker {
			display: none;
		}

		&:hover {
			color: var(--accent);
		}
	}

	details[open] summary {
		color: var(--text);
	}

	pre {
		margin: 0.3rem 0 0;
		font-size: var(--fs-xs);
		color: var(--text);
		white-space: pre-wrap;
		word-break: break-all;
		border-left: 2px solid var(--dim);
		padding-left: 1ch;
	}

	a {
		color: var(--accent);
	}

	.pager {
		display: flex;
		gap: 2ch;
		align-items: baseline;
	}

	.dim {
		color: var(--dim);
	}

	/* phones: the wide table scrolls instead of blowing out the page */
	@media (max-width: 700px) {
		table {
			display: block;
			overflow-x: auto;
		}
	}
</style>
