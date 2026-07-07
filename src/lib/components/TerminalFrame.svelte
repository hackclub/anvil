<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		children: Snippet;
		center?: boolean;
		/** solid backing (default) vs transparent so the shader shows through */
		bg?: boolean;
		/** marks this frame as the anchor the ASCII field carves its void around */
		voidAnchor?: boolean;
	}

	let { title = 'anvil.exe', children, center = false, bg = true, voidAnchor = false }: Props = $props();
</script>

<div class="frame" class:center class:transparent={!bg} data-ascii-void={voidAnchor ? '' : undefined}>
	<div class="bar">
		<span class="tab">┤ {title} ├</span>
	</div>
	<div class="content">
		{@render children()}
	</div>
</div>

<style>
	.frame {
		position: relative;
		background: color-mix(in srgb, var(--bg) 82%, transparent);
		border: 1px solid var(--dim);
		backdrop-filter: blur(3px);

		&.transparent {
			background: transparent;
			backdrop-filter: none;
			border-color: color-mix(in srgb, var(--dim) 65%, transparent);
		}

		&.center {
			text-align: center;
		}
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.35rem 0.7rem;
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 65%, transparent);
		font-size: var(--fs-xs);
		color: var(--dim);
	}

	.tab {
		color: var(--accent);
	}

	.content {
		padding: clamp(1.25rem, 4vw, 2.5rem);
	}
</style>
