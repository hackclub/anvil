<script lang="ts">
	import * as Sentry from '@sentry/sveltekit';
	import { navigating, page } from '$app/state';
	import TuiSpinner from '$lib/ascii/TuiSpinner.svelte';

	let { data, children } = $props();

	// Attach the signed-in user to every client-side log/error/breadcrumb, so
	// browser reports carry the same identity as the server side.
	$effect(() => {
		Sentry.setUser({ id: String(data.user.id), username: data.user.username });
	});

	// Delayed navigation indicator: only show loading UI when a page load has
	// been pending for more than 100ms, so fast navigations stay silent.
	let navSlow = $state(false);
	$effect(() => {
		if (navigating.to === null) {
			navSlow = false;
			return;
		}

		const t = setTimeout(() => (navSlow = true), 100);
		return () => clearTimeout(t);
	});

	const tabs = [
		{ href: '/dashboard', label: 'dashboard', icon: '⌂' },
		{ href: '/shop', label: 'shop', icon: '▦' },
		{ href: '/orders', label: 'orders', icon: '≡' },
		{ href: '/help', label: 'help', icon: '?' }
	];
</script>

<div class="app">
	<header class="topbar">
		<div class="identity">
			<img
				class="pfp"
				src={data.avatar}
				alt=""
				onerror={(e) => {
					const img = e.currentTarget as HTMLImageElement;
					if (img.src !== data.avatarFallback) img.src = data.avatarFallback;
				}}
			/>
			<span class="prompt">anvil@<strong>{data.user.username}</strong> ~/</span>
		</div>
		<nav class="topnav">
			{#each tabs as t (t.href)}
				<!-- help 302s to slack - open that journey in a new tab -->
				<a
					href={t.href}
					target={t.href === '/help' ? '_blank' : undefined}
					class:active={page.url.pathname.startsWith(t.href)}
				>
					<span class="ico">{t.icon}</span>
					{t.label}
				</a>
			{/each}
			{#if data.user.isAdmin}
				<a href="/admin" class:active={page.url.pathname.startsWith('/admin')} class="admin">
					<span class="ico">⚙</span>
					admin
				</a>
			{/if}
		</nav>
		{#if navSlow}
			<span class="navload"><TuiSpinner label="loading" /></span>
		{/if}
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

	<!-- phones swap the top tabs for a fixed bottom bar of big tappable icons.
	     help is top-bar/desktop only - it just 302s off to slack -->
	<nav class="bottomnav">
		{#each tabs.filter((t) => t.href !== '/help') as t (t.href)}
			<a href={t.href} class:active={page.url.pathname.startsWith(t.href)}>
				<span class="ico">{t.icon}</span>
				<span class="lbl">{t.label}</span>
			</a>
		{/each}
		{#if data.user.isAdmin}
			<a href="/admin" class:active={page.url.pathname.startsWith('/admin')}>
				<span class="ico">⚙</span>
				<span class="lbl">admin</span>
			</a>
		{/if}
	</nav>
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

	/* prompt-style identity: rounded avatar + "anvil@<user> ~/" */
	.identity {
		display: flex;
		align-items: center;
		gap: 0.7ch;
		min-width: 0;
	}

	.pfp {
		width: 1.5rem;
		height: 1.5rem;
		flex-shrink: 0;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid color-mix(in srgb, var(--dim) 55%, transparent);
		background: var(--bg-soft);
	}

	.prompt {
		font-size: var(--fs-sm);
		color: var(--dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;

		strong {
			color: var(--text);
			font-weight: 700;
		}
	}

	.topnav {
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

		/* terminal glyph before each label; inherits the link color so it
		   inverts correctly on the active tab */
		.ico {
			margin-right: 0.5ch;
		}
	}

	/* desktop: no bottom bar - the top tabs handle navigation */
	.bottomnav {
		display: none;
	}

	.navload {
		font-size: var(--fs-sm);
	}

	.balance {
		color: var(--accent);
		font-weight: 700;
		white-space: nowrap;
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

	/* phones: hide the top tabs (a fixed bottom bar of big icons takes over) and
	   keep the top bar as a slim row with just the sparks balance + logout */
	@media (max-width: 640px) {
		.topbar {
			gap: 0.75rem;
		}

		.pfp {
			width: 1.35rem;
			height: 1.35rem;
		}

		.topnav {
			display: none;
		}

		/* identity stays left; balance + logout group to the far right */
		.balance {
			margin-left: auto;
		}

		.bottomnav {
			display: flex;
			position: fixed;
			inset: auto 0 0 0;
			z-index: 50;
			background: color-mix(in srgb, var(--bg) 92%, transparent);
			backdrop-filter: blur(8px);
			border-top: 1px solid color-mix(in srgb, var(--dim) 45%, transparent);
			padding: 0.4rem 0.3rem calc(0.4rem + env(safe-area-inset-bottom));

			a {
				flex: 1;
				/* comfortable tap target regardless of the (small) label height */
				min-height: 3.25rem;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: 0.25rem;
				padding: 0.4rem 0.2rem;
				color: var(--dim);
				text-align: center;
				transition: color 0.12s ease;

				&.active {
					color: var(--accent);
				}
			}

			.ico {
				font-size: 2.1rem;
				line-height: 1;
			}

			.lbl {
				font-size: var(--fs-xs);
			}
		}

		/* clear the fixed bottom bar so content never hides behind it */
		main {
			padding-bottom: calc(4.75rem + env(safe-area-inset-bottom));
		}
	}

	.dim {
		color: var(--dim);
	}
</style>
