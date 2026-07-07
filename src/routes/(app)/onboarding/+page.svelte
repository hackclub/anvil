<script lang="ts">
	let { data, form } = $props();

	const status = $derived(data.user.verificationStatus);

	// which onboarding gate is the user standing at?
	const step = $derived.by((): 'ineligible' | 'verify' | 'hackatime' | 'done' => {
		if (status === 'ineligible') return 'ineligible';

		if (status === 'needs_submission') return 'verify';

		if (!data.user.hackatimeConnected) return 'hackatime';

		return 'done'; // pending/verified with hackatime - the layout bounces these
	});

	// the guide buddy walks newcomers through each gate, ascii kaomoji only
	const buddy = $derived.by((): { face: string; msg: string } => {
		if (step === 'ineligible')
			return {
				face: '[ T-T ]',
				msg: 'your verification came back ineligible... anvil grants are for teens in the Hack Club community. if you think this is wrong, e-mail ascpixi@hackclub.com!'
			};

		if (step === 'verify')
			return {
				face: '[ -w- ]',
				msg: "hiya! we need to verify you're an actual teen first! click below to go to Hack Club Auth to do so."
			};

		if (step === 'hackatime')
			return {
				face: '[ o-o ]',
				msg: "almost there! anvil rewards coding time tracked with hackatime, but we couldn't find a hackatime account for you. create one below - it takes under a minute!"
			};

		return { face: '[ >w< ]b', msg: "you're all set - welcome to the forge!" };
	});
</script>

{#snippet box(label: string)}
	<pre aria-hidden="true">{`╭${'─'.repeat(label.length + 2)}╮\n│ ${label} │\n╰${'─'.repeat(label.length + 2)}╯`}</pre>
{/snippet}

<svelte:head>
	<title>onboarding - anvil</title>
</svelte:head>

<div class="onboarding">
	<p class="buddy">
		<span class="face">{buddy.face}</span>
		<span class="msg">{buddy.msg}</span>
	</p>

	{#if step === 'done'}
		<a class="boxbtn primary" href="/dashboard">{@render box('▸ head to your dashboard')}</a>
	{:else if step === 'ineligible'}
		<a class="boxbtn" href="mailto:ascpixi@hackclub.com">
			{@render box('e-mail ascpixi@hackclub.com')}
		</a>
	{:else if step === 'hackatime'}
		<div class="btns">
			<a class="boxbtn primary" href="https://hackatime.hackclub.com/auth/hca" target="_blank" rel="noreferrer">
				{@render box('▸ create my hackatime account')}
			</a>

			<form method="POST" action="?/findHackatime">
				<button class="boxbtn" type="submit">{@render box('» i made one - find it!')}</button>
				{#if form?.hkNotFound}
					<span class="dim">hmm, still can't find you - sign in with the same account!</span>
				{/if}
			</form>
		</div>

		<p class="dim headstart">
			once your account exists, install the editor plugin so your time actually gets tracked -
			<a href="https://www.youtube.com/watch?v=grriwsX5mIo" target="_blank" rel="noreferrer">here's a setup video!</a>
		</p>
	{:else}
		<div class="btns">
			<a class="boxbtn primary" href="https://auth.hackclub.com/verifications/persona" target="_blank" rel="noreferrer">
				{@render box('▸ verify my identity')}
			</a>

			<form method="POST" action="?/refresh">
				<button class="boxbtn" type="submit">{@render box('» re-check my status')}</button>
				{#if form?.refreshed}
					<span class="dim">checked just now</span>
				{/if}
			</form>
		</div>

		<p class="dim headstart">
			meanwhile, get a head start - anvil rewards coding time tracked with
			<a href="https://hackatime.hackclub.com" target="_blank" rel="noreferrer">hackatime</a>
			, a lil plugin for your editor. set it up now (
			<a href="https://www.youtube.com/watch?v=grriwsX5mIo" target="_blank" rel="noreferrer">here's a setup video!</a>
			) and every minute you hack counts from day one.
		</p>
	{/if}
</div>

<style>
	/* TUI rule: one font size everywhere; centered both ways */
	.onboarding {
		min-height: calc(100vh - 16rem);
		max-width: 62ch;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.75rem;
		font-size: var(--fs-md);
		text-align: center;
	}

	.buddy {
		display: flex;
		gap: 2ch;
		align-items: baseline;
		text-align: left;
		line-height: 1.7;
	}

	.face {
		color: var(--accent);
		white-space: nowrap;
	}

	.msg {
		color: var(--text);
	}

	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: inherit;
		line-height: 1.25;
		white-space: pre;
		user-select: none;
	}

	/* box-drawing buttons, same family as the TUI button bands */
	.boxbtn {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		color: var(--text);
		cursor: pointer;
		display: inline-block;

		&.primary {
			color: var(--accent);
		}

		&:hover pre {
			background: var(--accent);
			color: var(--bg);
		}
	}

	.btns {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
	}

	form {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;

		.boxbtn {
			color: var(--dim);

			&:hover {
				color: var(--text);

				pre {
					background: var(--dim);
					color: var(--bg);
				}
			}
		}
	}

	.headstart {
		border-top: 1px solid color-mix(in srgb, var(--dim) 40%, transparent);
		padding-top: 1.5rem;
		line-height: 1.7;
		max-width: 56ch;

		a {
			color: var(--accent);
		}
	}

	.dim {
		color: var(--dim);
	}
</style>
