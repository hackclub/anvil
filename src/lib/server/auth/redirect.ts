// Post-login redirect targets come from a user-supplied `next` param. Only
// allow same-origin absolute paths: must start with a single "/" that is NOT
// followed by another "/" or "\" - otherwise "//evil.com" (protocol-relative)
// or "/\evil.com" would be resolved by the browser as an off-site redirect.
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
	return next && /^\/(?![/\\])/.test(next) ? next : fallback;
}
