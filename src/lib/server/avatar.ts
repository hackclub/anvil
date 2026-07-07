// Profile pictures for admin views: slack avatar via Cachet (hack club's
// tokenless slack-avatar cache), gravatar identicon as the fallback for
// users without a slack id (the <img> swaps to `avatarFallback` on error).
import { createHash } from 'node:crypto';

export function gravatarUrl(email: string): string {
	const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex');
	return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=64`;
}

export function avatarUrl(slackId: string | null, email: string): string {
	return slackId ? `https://cachet.dunkirk.sh/users/${slackId}/r` : gravatarUrl(email);
}
