<script lang="ts">
	interface Props {
		num: string;
		title: string;
	}

	let { num, title }: Props = $props();
</script>

<h2 class="heading">
	<span class="rule">──</span>
	<span class="num">{num}</span>
	<span class="brk">┤</span>
	<span class="title">{title}</span>
	<span class="brk">├</span>
	<span class="rule fill">──────────────────────────────────</span>
</h2>

<style>
	.heading {
		display: flex;
		align-items: center;
		gap: 1ch;

		/* terminal-uniform: same size as everything else, on the 2rem line grid */
		font-size: var(--fs-md);
		line-height: 2rem;
		font-weight: 400;
		color: var(--dim);
		margin-bottom: 2rem;
		white-space: nowrap;
		overflow: hidden;
	}

	.num {
		color: var(--accent);
		font-weight: 700;
	}

	.title {
		color: var(--text);
		text-transform: lowercase;
		letter-spacing: 0.02em;
	}

	.brk {
		color: var(--dim);
	}

	.rule {
		color: var(--dim);

		&.fill {
			flex: 1;
			overflow: hidden;
		}
	}
</style>
