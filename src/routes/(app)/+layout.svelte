<script lang="ts">
	import { page } from '$app/state';

	let { data, children } = $props();

	const tabs = [
		{ href: '/dashboard', label: 'dashboard' },
		{ href: '/shop', label: 'shop' },
		{ href: '/orders', label: 'orders' },
		{ href: '/help', label: 'help' }
	];
</script>

<div class="app">
	<header class="topbar">
		<nav>
			{#each tabs as t (t.href)}
				<!-- help 302s to slack - open that journey in a new tab -->
				<a
					href={t.href}
					target={t.href === '/help' ? '_blank' : undefined}
					class:active={page.url.pathname.startsWith(t.href)}
				>
					{t.label}
				</a>
			{/each}
			{#if data.user.isAdmin}
				<a href="/admin" class:active={page.url.pathname.startsWith('/admin')} class="admin">admin</a>
			{/if}
		</nav>
		<a class="balance" href="/shop" title="your sparks">
			<span class="spark">✶</span>
			{data.balance}
		</a>
		<form method="POST" action="/auth/logout" class="logout">
			<button type="submit">logout</button>
		</form>
	</header>

	{#if data.verificationNag}
		<div class="nag">
			<span class="dim">!</span>
			your identity verification is still
			<strong>pending</strong>
			- you can work on your projects in the meantime; shipping unlocks once it clears.
			<form method="POST" action="/auth/refresh" class="checkstatus">
				<button type="submit">» check status</button>
			</form>
		</div>
	{/if}

	<main class="wrap">
		{@render children()}
	</main>
</div>

<style>
	.app {
		min-height: 100svh;
		display: flex;
		flex-direction: column;
	}

	.topbar {
		display: flex;
		align-items: center;
		gap: 2rem;
		padding: 0.85rem clamp(1rem, 4vw, 3rem);
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 45%, transparent);
		font-size: var(--fs-sm);
	}

	nav {
		display: flex;
		gap: 1.5ch;
		flex: 1;

		a {
			color: var(--dim);
			padding: 0.15rem 0.6ch;
			transition: color 0.12s ease;

			&:hover {
				color: var(--text);
			}

			&.active {
				color: var(--bg);
				background: var(--accent);
			}

			&.admin {
				margin-left: auto;
			}
		}
	}

	.balance {
		color: var(--accent);
		font-weight: 700;
	}

	.logout button {
		background: none;
		border: 1px solid var(--dim);
		color: var(--dim);
		font: inherit;
		padding: 0.15rem 1ch;
		cursor: pointer;
		transition:
			color 0.12s ease,
			border-color 0.12s ease;

		&:hover {
			color: var(--accent);
			border-color: var(--accent);
		}
	}

	.nag {
		padding: 0.6rem clamp(1rem, 4vw, 3rem);
		font-size: var(--fs-sm);
		color: var(--text);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
	}

	.checkstatus {
		display: inline;

		button {
			background: none;
			border: none;
			padding: 0;
			font: inherit;
			color: var(--accent);
			cursor: pointer;

			&:hover {
				background: var(--accent);
				color: var(--bg);
			}
		}
	}

	main {
		flex: 1;
		padding-block: 2.5rem;
	}

	.dim {
		color: var(--dim);
	}
</style>
