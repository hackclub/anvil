<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		words: string[];
		/** ms between swaps */
		interval?: number;
		/** ms offset so multiple tokens don't flip in unison */
		delay?: number;
	}

	let { words, interval = 2800, delay = 0 }: Props = $props();

	// words is a static prop (never reassigned), so seeding from it is intentional
	// svelte-ignore state_referenced_locally
	let display = $state(words[0]);

	onMount(() => {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const noise = '!<>-_\\/[]{}=+*^?#';
		let idx = 0;
		let revealTimer: ReturnType<typeof setInterval> | undefined;
		let cycleTimer: ReturnType<typeof setInterval> | undefined;
		let startTimer: ReturnType<typeof setTimeout> | undefined;

		function scrambleTo(target: string) {
			if (reduced) {
				display = target;
				return;
			}

			let frame = 0;
			clearInterval(revealTimer);
			revealTimer = setInterval(() => {
				frame++;
				const revealed = frame - 3;
				let s = '';
				for (let i = 0; i < target.length; i++) {
					s += i < revealed ? target[i] : noise[(Math.random() * noise.length) | 0];
				}

				display = s;
				if (revealed >= target.length) {
					clearInterval(revealTimer);
					display = target;
				}
			}, 45);
		}

		function next() {
			idx = (idx + 1) % words.length;
			scrambleTo(words[idx]);
		}

		startTimer = setTimeout(() => {
			cycleTimer = setInterval(next, interval);
		}, delay);

		return () => {
			clearInterval(revealTimer);
			clearInterval(cycleTimer);
			clearTimeout(startTimer);
		};
	});
</script>

<!-- no whitespace inside the token: it must render <word>, not < word > -->
<!-- prettier-ignore -->
<span class="tok"><span class="br">&lt;</span>{display}<span class="br">&gt;</span></span>

<style>
	.tok {
		color: var(--accent);
		font-weight: 700;
		white-space: nowrap;
	}

	.br {
		color: var(--dim);
		font-weight: 400;
	}
</style>
