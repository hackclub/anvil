<script lang="ts">
	import { enhance } from '$app/forms';
	import { Pending, withPending } from '$lib/pending.svelte';
	import TuiSpinner from '$lib/ascii/TuiSpinner.svelte';

	let { data, form } = $props();
	let expanded = $state<number | null>(null);

	// one tracker per action; the forms render once per expanded row, so a
	// single "which user" marker keeps spinners on the right row
	const fetchingHca = new Pending();
	const banning = new Pending();
	const unbanning = new Pending();
	const adjusting = new Pending();
	const savingNotes = new Pending();
	let pendingUser = $state<number | null>(null);

	const forUser = (pending: Pending, userId: number) =>
		withPending(pending, () => {
			pendingUser = userId;
			return ({ update }) => update();
		});
</script>

<svelte:head>
	<title>admin/users - anvil</title>
</svelte:head>

<div class="users">
	<form method="GET" class="search">
		<input name="q" value={data.q} placeholder="search email / username / slack id" />
		<button type="submit">[ grep ]</button>
	</form>

	{#if form?.error}<p class="error">! {form.error}</p>{/if}

	<table>
		<thead>
			<tr>
				<th>user</th>
				<th>verification</th>
				<th>trust</th>
				<th>
					<span class="spark">✶</span>
				</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as u (u.id)}
				<tr class:banned={u.isBanned}>
					<td>
						<span class="who">
							<img
								class="avatar"
								src={u.avatar}
								alt=""
								loading="lazy"
								onerror={(e) => {
									const img = e.currentTarget as HTMLImageElement;
									if (img.src !== u.avatarFallback) {
										img.src = u.avatarFallback;
									}
								}}
							/>
							{#if u.username}<span class="uname">@{u.username}</span>{/if}
							<span class="dim">{u.email}</span>
							{#if u.isAdmin}<span class="tag">admin</span>{/if}
							{#if u.isBanned}<span class="tag banned-tag">banned</span>{/if}
						</span>
					</td>
					<td class="dim">{u.verificationStatus}{u.yswsEligible ? ' ✓' : ''}</td>
					<td class="dim">{u.hackatimeTrustLevel ?? '-'}</td>
					<td>{Number(u.balance)}</td>
					<td>
						<button class="ghost" onclick={() => (expanded = expanded === u.id ? null : u.id)}>
							[{expanded === u.id ? '−' : '+'}]
						</button>
					</td>
				</tr>
				{#if expanded === u.id}
					<tr class="detail">
						<td colspan="5">
							<dl class="idlist">
								<dt>email</dt>
								<dd>{u.email}</dd>
								<dt>slack id</dt>
								<dd>{u.slackId ?? '∅'}</dd>
								<dt>hca id</dt>
								<dd>{u.hcaId}</dd>
								<dt>hackatime id</dt>
								<dd>{u.hackatimeId ?? '∅'}</dd>
							</dl>

							<form method="POST" action="?/hcaInfo" use:enhance={forUser(fetchingHca, u.id)}>
								<input type="hidden" name="userId" value={u.id} />
								<button type="submit" disabled={fetchingHca.active}>
									{#if fetchingHca.showing && pendingUser === u.id}
										<TuiSpinner label="fetching" />
									{:else}
										[ view hca info ]
									{/if}
								</button>
							</form>
							{#if form?.hcaInfo?.userId === u.id}
								<dl class="idlist hcainfo">
									<dt>name</dt>
									<dd>
										{[form.hcaInfo.firstName, form.hcaInfo.lastName].filter(Boolean).join(' ') || '∅'}
									</dd>
									<dt>legal name</dt>
									<dd>
										{[form.hcaInfo.legalFirstName, form.hcaInfo.legalLastName].filter(Boolean).join(' ') || '∅'}
									</dd>
									<dt>birthday</dt>
									<dd>{form.hcaInfo.birthday ?? '∅'}</dd>
									<dt>phone</dt>
									<dd>{form.hcaInfo.phoneNumber ?? '∅'}</dd>
									<dt>address</dt>
									<dd>
										{[
											form.hcaInfo.addressLine1,
											form.hcaInfo.addressLine2,
											form.hcaInfo.addressCity,
											form.hcaInfo.addressState,
											form.hcaInfo.addressPostalCode,
											form.hcaInfo.addressCountry
										]
											.filter(Boolean)
											.join(', ') || '∅'}
									</dd>
								</dl>
							{/if}

							<p class="subhead">
								<span class="dim">//</span>
								projects
							</p>
							{#if (data.projectsByUser[u.id] ?? []).length === 0}
								<p class="dim">- none -</p>
							{:else}
								<ul class="projects">
									{#each data.projectsByUser[u.id] ?? [] as p (p.id)}
										<li>
											<a href={`/admin/projects/${p.id}`}>{p.title}</a>
											<span class="dim">{p.shipStatus}</span>
										</li>
									{/each}
								</ul>
							{/if}

							<p class="subhead">
								<span class="dim">//</span>
								ledger
							</p>
							{#if (data.ledgerByUser[u.id] ?? []).length === 0}
								<p class="dim">- no entries -</p>
							{:else}
								<table class="ledger">
									<tbody>
										{#each data.ledgerByUser[u.id] ?? [] as l (l.id)}
											<tr>
												<td class="dim">{l.createdAt.toISOString().slice(0, 10)}</td>
												<td>{l.kind}</td>
												<td class:neg={l.amount < 0}>{l.amount > 0 ? '+' : ''}{l.amount}</td>
												<td class="dim">
													{#if l.projectId}
														<a href={`/admin/projects/${l.projectId}`}>project ↗</a>
													{/if}
													{l.note ?? ''}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							{/if}

							<p class="subhead">
								<span class="dim">//</span>
								actions
							</p>
							{#if u.isBanned}
								<p class="dim">ban reason: {u.banReason}</p>
								<form method="POST" action="?/unban" use:enhance={forUser(unbanning, u.id)}>
									<input type="hidden" name="userId" value={u.id} />
									<button type="submit" disabled={unbanning.active}>
										{#if unbanning.showing && pendingUser === u.id}
											<TuiSpinner label="unbanning" />
										{:else}
											[ unban ]
										{/if}
									</button>
								</form>
							{:else}
								<form method="POST" action="?/ban" use:enhance={forUser(banning, u.id)}>
									<input type="hidden" name="userId" value={u.id} />
									<input name="reason" placeholder="ban reason (required)" required />
									<button type="submit" class="danger" disabled={banning.active}>
										{#if banning.showing && pendingUser === u.id}
											<TuiSpinner label="banning" />
										{:else}
											[ ban ]
										{/if}
									</button>
								</form>
							{/if}
							<form method="POST" action="?/adjust" use:enhance={forUser(adjusting, u.id)}>
								<input type="hidden" name="userId" value={u.id} />
								<input name="amount" type="number" step="0.01" placeholder="±sparks" required />
								<input name="note" placeholder="why (required)" required />
								<button type="submit" disabled={adjusting.active}>
									{#if adjusting.showing && pendingUser === u.id}
										<TuiSpinner label="adjusting" />
									{:else}
										[ adjust balance ]
									{/if}
								</button>
							</form>

							<p class="subhead">
								<span class="dim">//</span>
								notes
							</p>
							<form method="POST" action="?/notes" use:enhance={forUser(savingNotes, u.id)}>
								<input type="hidden" name="userId" value={u.id} />
								<input name="notes" value={u.internalNotes ?? ''} placeholder="internal notes" />
								<button type="submit" disabled={savingNotes.active}>
									{#if savingNotes.showing && pendingUser === u.id}
										<TuiSpinner label="saving" />
									{:else}
										[ save notes ]
									{/if}
								</button>
							</form>
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
</div>

<style>
	.users {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		font-size: var(--fs-sm);
	}

	.search {
		display: flex;
		gap: 1ch;

		input {
			width: 40ch;
		}
	}

	input {
		background: var(--bg-soft);
		border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);
		color: var(--text);
		font: inherit;
		font-size: var(--fs-sm);
		padding: 0.3rem 1ch;
	}

	button {
		background: none;
		border: 1px solid var(--dim);
		color: var(--dim);
		font: inherit;
		font-size: var(--fs-sm);
		padding: 0.25rem 1ch;
		cursor: pointer;

		&:hover:not(:disabled) {
			color: var(--text);
			border-color: var(--text);
		}

		&.danger:hover:not(:disabled) {
			color: var(--accent);
			border-color: var(--accent);
		}

		&.ghost {
			border: none;
			padding: 0;
		}

		&:disabled {
			color: color-mix(in srgb, var(--dim) 55%, transparent);
			border-color: color-mix(in srgb, var(--dim) 40%, transparent);
			cursor: wait;
		}
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

	tr.banned td {
		opacity: 0.55;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 1ch;
		flex-wrap: wrap;
	}

	.avatar {
		width: 1.6rem;
		height: 1.6rem;
		border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);
	}

	.uname {
		color: var(--accent);
		font-weight: 700;
	}

	.idlist {
		display: grid;
		grid-template-columns: 14ch 1fr;
		gap: 0.3rem 2ch;
		margin: 0.4rem 0 0.75rem;

		dt {
			color: var(--dim);
		}
	}

	.hcainfo {
		border-left: 2px solid var(--accent);
		padding-left: 1.5ch;
	}

	.subhead {
		margin-top: 1.4rem;
		margin-bottom: 0.5rem;
		color: var(--text);
		font-weight: 700;
	}

	.projects {
		list-style: none;
		padding: 0;
		margin: 0.25rem 0;

		li {
			display: flex;
			gap: 1.5ch;
			padding: 0.1rem 0;
		}
	}

	.projects a,
	.ledger a {
		color: var(--accent);
	}

	table.ledger {
		width: auto;
		margin: 0.25rem 0;

		td {
			border-bottom: none;
			padding: 0.15rem 2.5ch 0.15rem 0;

			&.neg {
				color: var(--accent);
			}
		}
	}

	.tag {
		font-size: var(--fs-xs);
		border: 1px solid var(--dim);
		color: var(--dim);
		padding: 0 0.5ch;
		margin-left: 1ch;
	}

	.banned-tag {
		color: var(--accent);
		border-color: var(--accent);
	}

	tr.detail td {
		background: var(--bg-soft);
		padding: 1rem 2ch 1.25rem;
	}

	tr.detail form {
		display: flex;
		gap: 1ch;
		margin: 0.4rem 0;
		flex-wrap: wrap;
	}

	.error {
		color: var(--accent);
	}

	.dim {
		color: var(--dim);
	}

	/* phones: the wide tables (roster + ledger) scroll instead of blowing
	   out the page */
	@media (max-width: 700px) {
		table {
			display: block;
			overflow-x: auto;
		}
	}
</style>
