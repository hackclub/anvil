<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { createLogger } from '$lib/log';

	const log = createLogger('error-page');

	// Records that the user actually landed on an error screen (the thrown error
	// itself is already reported via handleError). Runs on the client only.
	onMount(() => {
		log.warn('error page shown', {
			status: page.status,
			message: page.error?.message,
			path: page.url.pathname
		});
	});

	const DIGITS: Record<string, string[]> = {
		'0': ['█▀▀▀█', '█   █', '█   █', '█   █', '█▄▄▄█'],
		'1': ['  █  ', ' ▀█  ', '  █  ', '  █  ', ' ▄█▄ '],
		'2': ['▀▀▀▀█', '    █', '█▀▀▀▀', '█    ', '█▄▄▄▄'],
		'3': ['▀▀▀▀█', '    █', ' ▀▀▀█', '    █', '▄▄▄▄█'],
		'4': ['█   █', '█   █', '▀▀▀▀█', '    █', '    █'],
		'5': ['█▀▀▀▀', '█    ', '▀▀▀▀█', '    █', '▄▄▄▄█'],
		'6': ['█▀▀▀▀', '█    ', '█▀▀▀█', '█   █', '█▄▄▄█'],
		'7': ['▀▀▀▀█', '    █', '   █ ', '  █  ', '  █  '],
		'8': ['█▀▀▀█', '█   █', '█▀▀▀█', '█   █', '█▄▄▄█'],
		'9': ['█▀▀▀█', '█   █', '▀▀▀▀█', '    █', '▄▄▄▄█']
	};

	const ART_404 = [
		' ___   ___  ________  ___   ___     ',
		'|\\  \\ |\\  \\|\\   __  \\|\\  \\ |\\  \\    ',
		'\\ \\  \\\\_\\  \\ \\  \\|\\  \\ \\  \\\\_\\  \\   ',
		' \\ \\______  \\ \\  \\\\\\  \\ \\______  \\  ',
		'  \\|_____|\\  \\ \\  \\\\\\  \\|_____|\\  \\ ',
		'         \\ \\__\\ \\_______\\     \\ \\__\\',
		'          \\|__|\\|_______|      \\|__|'
	].join('\n');

	const bigStatus = $derived(
		page.status === 404
			? ART_404
			: Array.from({ length: 5 }, (_, r) =>
					[...String(page.status)].map((d) => DIGITS[d]?.[r] ?? '     ').join('  ')
				).join('\n')
	);

	const is404 = $derived(page.status === 404);
	const buddy = $derived(
		is404
			? { face: '[ >~< ]', msg: "woops... there's nothing here!!" }
			: { face: '[ x_x ]', msg: `something broke on our end (${page.status}). try again in a bit!` }
	);
</script>

{#snippet box(label: string)}
	<pre
		class="btn"
		aria-hidden="true">{`╭${'─'.repeat(label.length + 2)}╮\n│ ${label} │\n╰${'─'.repeat(label.length + 2)}╯`}
	</pre>
{/snippet}

<svelte:head>
	<title>{page.status} - anvil</title>
</svelte:head>

<div class="err">
	<pre class="code" aria-label={String(page.status)}>{bigStatus}</pre>

	<p class="buddy">
		<span class="face">{buddy.face}</span>
		<span class="msg">{buddy.msg}</span>
	</p>

	<a class="boxbtn" href="/">{@render box('▸ back to the forge')}</a>
</div>

<style>
	.err {
		min-height: 100svh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.75rem;
		font-family: var(--font-mono);
		font-size: var(--fs-md);
	}

	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: inherit;
		line-height: 1.25;
		white-space: pre;
		user-select: none;
	}

	.code {
		color: var(--accent);
	}

	.buddy {
		display: flex;
		gap: 2ch;
		align-items: baseline;
		line-height: 1.7;
		max-width: 56ch;
		padding-inline: 2ch;
	}

	.face {
		color: var(--accent);
		white-space: nowrap;
	}

	.msg {
		color: var(--text);
	}

	.boxbtn {
		color: var(--accent);
		text-decoration: none;

		&:hover .btn {
			background: var(--accent);
			color: var(--bg);
		}
	}
</style>
