// Tracks in-flight network work and exposes a `showing` flag that only turns
// on once the wait exceeds a threshold (100ms by default). Fast responses
// never flash loading UI; slow ones get feedback before the user starts
// wondering whether the click registered.
//
// Usage:
//   const pending = new Pending();
//   ...
//   await pending.track(fetch(...));       // or pending.start() / pending.end()
//   ...
//   {#if pending.showing}<Spinner />{/if}
//   <button disabled={pending.active}>...</button>
//
// `active` is true for the whole in-flight window (use it to prevent double
// submits); `showing` is the delayed flag (use it for visible loading UI).
import type { SubmitFunction } from '@sveltejs/kit';

export class Pending {
	#count = $state(0);
	#showing = $state(false);
	#timer: ReturnType<typeof setTimeout> | null = null;
	readonly delay: number;

	constructor(delay = 100) {
		this.delay = delay;
	}

	get active(): boolean {
		return this.#count > 0;
	}

	get showing(): boolean {
		return this.#showing;
	}

	start() {
		this.#count++;
		if (this.#count === 1) {
			this.#timer = setTimeout(() => {
				if (this.#count > 0) this.#showing = true;
			}, this.delay);
		}
	}

	end() {
		if (this.#count === 0) return;

		this.#count--;

		if (this.#count === 0) {
			if (this.#timer !== null) clearTimeout(this.#timer);

			this.#timer = null;
			this.#showing = false;
		}
	}

	/** Wraps a promise (or async fn) in start/end bookkeeping. */
	async track<T>(work: Promise<T> | (() => Promise<T>)): Promise<T> {
		this.start();
		try {
			return await (typeof work === 'function' ? work() : work);
		} finally {
			this.end();
		}
	}
}

/**
 * Wraps a `use:enhance` submit function with Pending bookkeeping:
 *
 *   <form method="POST" action="?/save" use:enhance={withPending(busy)}>
 *
 * With no inner function, results apply via the default `update()`. Pass an
 * inner submit function to keep custom behavior; the pending window covers it
 * either way.
 */
export function withPending(pending: Pending, inner?: SubmitFunction): SubmitFunction {
	return async (input) => {
		// a cancelled submit never fires the result callback - don't count it
		let cancelled = false;
		const handler = await inner?.({
			...input,
			cancel: () => {
				cancelled = true;
				input.cancel();
			}
		});
		if (cancelled) return;

		pending.start();
		return async (opts) => {
			try {
				if (handler) {
					await handler(opts);
				} else {
					await opts.update();
				}
			} finally {
				pending.end();
			}
		};
	};
}
