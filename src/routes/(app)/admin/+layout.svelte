<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();

	const tabs = [
		{ href: '/admin', label: 'overview' },
		{ href: '/admin/stats', label: 'stats' },
		{ href: '/admin/users', label: 'users' },
		{ href: '/admin/projects', label: 'projects' },
		{ href: '/admin/score', label: 'score' },
		{ href: '/admin/items', label: 'items' },
		{ href: '/admin/jobs', label: 'jobs' },
		{ href: '/admin/audit', label: 'audit' }
	];
</script>

<div class="admin">
	<nav>
		<span class="dim">/admin</span>
		{#each tabs as t (t.href)}
			<a
				href={t.href}
				class:active={t.href === '/admin' ? page.url.pathname === '/admin' : page.url.pathname.startsWith(t.href)}
			>
				{t.label}
			</a>
		{/each}
	</nav>
	{@render children()}
</div>

<style>
	.admin {
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
	}

	nav {
		display: flex;
		gap: 1.5ch;
		font-size: var(--fs-sm);
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 40%, transparent);
		padding-bottom: 0.6rem;

		a {
			color: var(--dim);
			padding: 0 0.5ch;

			&:hover {
				color: var(--text);
			}

			&.active {
				color: var(--bg);
				background: var(--accent);
			}
		}
	}

	.dim {
		color: var(--dim);
	}

	/* phones: eight tabs don't fit on one line */
	@media (max-width: 640px) {
		nav {
			flex-wrap: wrap;
			row-gap: 0.3rem;
		}
	}
</style>
