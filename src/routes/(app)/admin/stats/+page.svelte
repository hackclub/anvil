<script lang="ts">
	// Chart.js on canvases, themed from the CSS palette at mount time so the
	// charts wear the same terminal skin as everything else (mono font, dim
	// grids, accent series).
	import { onMount } from 'svelte';
	import { Chart } from 'chart.js/auto';

	let { data } = $props();

	let signupsEl = $state<HTMLCanvasElement>();
	let hoursEl = $state<HTMLCanvasElement>();
	let funnelEl = $state<HTMLCanvasElement>();

	const pct = (v: number, of: number) => (of > 0 ? `${Math.round((v / of) * 100)}%` : '-');
	const fmtH = (v: number) => `${Math.round(v * 10) / 10}h`;
	const fmtD = (v: number | null) =>
		v == null ? '-' : v < 1 ? `${Math.round(v * 24)}h` : `${Math.round(v * 10) / 10}d`;

	const signups = $derived(data.funnel[0]?.n ?? 0);

	onMount(() => {
		const css = getComputedStyle(document.documentElement);
		const accent = css.getPropertyValue('--accent').trim();
		const dim = css.getPropertyValue('--dim').trim();
		const text = css.getPropertyValue('--text').trim();
		const bgSoft = css.getPropertyValue('--bg-soft').trim();

		Chart.defaults.font.family = css.getPropertyValue('--font-mono').trim();
		Chart.defaults.font.size = 11;
		Chart.defaults.color = dim;

		const grid = { color: dim + '30' };
		const days = (rows: { day: string }[]) => rows.map((r) => r.day.slice(5));
		const tooltip = {
			backgroundColor: bgSoft,
			titleColor: text,
			bodyColor: text,
			borderColor: dim,
			borderWidth: 1,
			cornerRadius: 0,
			displayColors: false
		};

		const charts = [
			new Chart(signupsEl!, {
				type: 'bar',
				data: {
					labels: days(data.signupsByDay),
					datasets: [{ data: data.signupsByDay.map((r) => r.n), backgroundColor: accent }]
				},
				options: {
					maintainAspectRatio: false,
					plugins: { legend: { display: false }, tooltip },
					scales: {
						x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
						y: { grid, ticks: { precision: 0 }, beginAtZero: true }
					}
				}
			}),
			new Chart(hoursEl!, {
				type: 'line',
				data: {
					labels: days(data.hoursByDay),
					datasets: [
						{
							data: data.hoursByDay.map((r) => r.n),
							borderColor: accent,
							backgroundColor: accent + '22',
							fill: true,
							stepped: true,
							pointRadius: 0,
							borderWidth: 1.5
						}
					]
				},
				options: {
					maintainAspectRatio: false,
					plugins: { legend: { display: false }, tooltip },
					scales: {
						x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
						y: { grid, beginAtZero: true }
					}
				}
			}),
			new Chart(funnelEl!, {
				type: 'bar',
				data: {
					labels: data.funnel.map((f) => f.stage),
					datasets: [{ data: data.funnel.map((f) => f.n), backgroundColor: accent }]
				},
				options: {
					indexAxis: 'y',
					maintainAspectRatio: false,
					plugins: { legend: { display: false }, tooltip },
					scales: {
						x: { grid, ticks: { precision: 0 }, beginAtZero: true },
						y: { grid: { display: false }, ticks: { color: text } }
					}
				}
			})
		];

		return () => charts.forEach((c) => c.destroy());
	});
</script>

<svelte:head>
	<title>admin/stats - anvil</title>
</svelte:head>

<div class="stats">
	<section>
		<h2>
			<span class="dim">//</span>
			activity
		</h2>
		<div class="cards">
			{#each [{ label: 'active today', value: data.activity.activeToday }, { label: 'active this week', value: data.activity.activeThisWeek }, { label: 'shipped this week', value: data.activity.shippedThisWeek }, { label: 'approved this week', value: data.activity.approvedThisWeek }] as card (card.label)}
				<div class="card">
					<span class="num">{card.value}</span>
					<span class="dim">{card.label}</span>
				</div>
			{/each}
		</div>
	</section>

	<div class="row">
		<section>
			<h2>
				<span class="dim">//</span>
				signups - last 30 days
			</h2>
			<div class="chart">
				<canvas bind:this={signupsEl}></canvas>
			</div>
		</section>
		<section>
			<h2>
				<span class="dim">//</span>
				approved hours - last 30 days
			</h2>
			<div class="chart">
				<canvas bind:this={hoursEl}></canvas>
			</div>
		</section>
	</div>

	<section>
		<h2>
			<span class="dim">//</span>
			funnel
		</h2>
		<div class="chart funnelchart">
			<canvas bind:this={funnelEl}></canvas>
		</div>
		<table>
			<thead>
				<tr>
					<th>stage</th>
					<th>users</th>
					<th>of signups</th>
					<th>step conv.</th>
				</tr>
			</thead>
			<tbody>
				{#each data.funnel as stage, i (stage.stage)}
					<tr>
						<td>{stage.stage}</td>
						<td>{stage.n}</td>
						<td class="dim">{pct(stage.n, signups)}</td>
						<td class="dim">{i === 0 ? '-' : pct(stage.n, data.funnel[i - 1].n)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<div class="row">
		<section>
			<h2>
				<span class="dim">//</span>
				hours shipped
			</h2>
			<dl>
				<dt>approved hours (all time)</dt>
				<dd>{fmtH(data.hours.approved)}</dd>
				<dt>approved hours (30d)</dt>
				<dd>{fmtH(data.hours.approved30d)}</dd>
				<dt>approved hours (7d)</dt>
				<dd>{fmtH(data.hours.approved7d)}</dd>
				<dt>hours waiting in review</dt>
				<dd>{fmtH(data.hours.pending)}</dd>
				<dt>ships approved / pending / total</dt>
				<dd>{data.hours.shipsApproved} / {data.hours.shipsPending} / {data.hours.shipsTotal}</dd>
				<dt>avg hours per approved ship</dt>
				<dd>
					{data.hours.shipsApproved > 0 ? fmtH(data.hours.approved / data.hours.shipsApproved) : '-'}
				</dd>
			</dl>
		</section>

		<section>
			<h2>
				<span class="dim">//</span>
				conversion speed &amp; sparks
			</h2>
			<dl>
				<dt>median signup → first project</dt>
				<dd>{fmtD(data.medianDaysToFirstProject)}</dd>
				<dt>median signup → first ship</dt>
				<dd>{fmtD(data.medianDaysToFirstShip)}</dd>
				<dt>sparks earned</dt>
				<dd>{data.sparks.earned}</dd>
				<dt>sparks spent</dt>
				<dd>{data.sparks.spent}</dd>
				<dt>sparks outstanding</dt>
				<dd>{Math.round((data.sparks.earned - data.sparks.spent) * 100) / 100}</dd>
			</dl>
		</section>
	</div>
</div>

<style>
	.stats {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		font-size: var(--fs-sm);
	}

	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
	}

	@media (max-width: 900px) {
		.row {
			grid-template-columns: 1fr;
		}
	}

	h2 {
		font-size: var(--fs-sm);
		font-weight: 700;
		margin-bottom: 0.75rem;
	}

	.cards {
		display: flex;
		gap: 2rem;
		flex-wrap: wrap;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		border: 1px solid color-mix(in srgb, var(--dim) 40%, transparent);
		padding: 0.75rem 2ch;
		min-width: 18ch;

		.num {
			font-size: var(--fs-lg);
			color: var(--accent);
		}
	}

	.chart {
		position: relative;
		height: 220px;
		border: 1px solid color-mix(in srgb, var(--dim) 40%, transparent);
		padding: 0.75rem 1ch;
	}

	.funnelchart {
		height: 280px;
		max-width: 88ch;
		margin-bottom: 1rem;
	}

	table {
		border-collapse: collapse;
	}

	th {
		text-align: left;
		color: var(--dim);
		font-weight: 400;
		padding: 0.3rem 3ch 0.3rem 0;
		border-bottom: 1px solid var(--dim);
	}

	td {
		padding: 0.35rem 3ch 0.35rem 0;
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 25%, transparent);
	}

	dl {
		display: grid;
		grid-template-columns: 34ch 1fr;
		gap: 0.35rem 2ch;
	}

	dt {
		color: var(--dim);
	}

	.dim {
		color: var(--dim);
	}
</style>
