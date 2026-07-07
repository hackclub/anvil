<script lang="ts">
	let { data } = $props();
	const s = $derived(data.stats);
</script>

<svelte:head>
	<title>admin - anvil</title>
</svelte:head>

<dl class="stats">
	<dt>users</dt>
	<dd>{s.users}</dd>
	<dt>projects</dt>
	<dd>{s.projects}</dd>
	<dt>ships in review</dt>
	<dd>{s.pendingShips}</dd>
	<dt>ships approved</dt>
	<dd>{s.approvedShips}</dd>
	<dt>orders pending</dt>
	<dd>{s.pendingOrders}</dd>
	<dt>sparks issued</dt>
	<dd>
		<span class="spark">✶</span>
		{s.sparksEarned}
	</dd>
	<dt>approved hours</dt>
	<dd>{s.approvedHours}h</dd>
	<dt>realized rate</dt>
	<dd class:hot={s.avgRate > 8.5}>
		${s.avgRate}/hr
		<span class="dim">(target ≤ $8.50)</span>
	</dd>
</dl>

<style>
	.stats {
		display: grid;
		grid-template-columns: 20ch 1fr;
		gap: 0.5rem 2ch;
		font-size: var(--fs-sm);
		max-width: 60ch;
	}

	dt {
		color: var(--dim);
	}

	dd.hot {
		color: var(--accent);
		font-weight: 700;
	}

	.dim {
		color: var(--dim);
	}
</style>
