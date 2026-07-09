// Slack DMs to participants: review outcomes and order updates. Unlike the
// webhook feed (staff channel), DMs need a real bot token with chat:write -
// SLACK_BOT_TOKEN unset = silently off (dev). Fire-and-forget like feed()
// and audit(): a Slack hiccup must never break the action being reported.
// SLACK_API_BASE exists so dev can point DMs at a local catcher.
import { createLogger } from '$lib/log';
import { optional } from '../env';
import { escapeSlack } from './slackText';

const log = createLogger('slack.dm');

interface Recipient {
	slackId: string | null;
}

// #anvil-bulletin, #anvil-help - every fresh signup gets dropped into both.
const SIGNUP_CHANNEL_IDS = ['C0BFHPCH9D1', 'C0BFN1F5TBQ'];

/** Invites a new user into the standard signup channels. Requires the bot
 *  token to also carry channels:write/groups:write (conversations.invite) -
 *  same unset-token / no-slack-id no-op convention as dm(). */
export function inviteToSignupChannels(user: Recipient): void {
	const token = optional('SLACK_BOT_TOKEN');
	if (!token || !user.slackId) return;

	const base = optional('SLACK_API_BASE', 'https://slack.com/api').replace(/\/$/, '');
	for (const channel of SIGNUP_CHANNEL_IDS) {
		fetch(`${base}/conversations.invite`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json; charset=utf-8'
			},
			body: JSON.stringify({ channel, users: user.slackId })
		}).then(
			async (res) => {
				const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
				// already_in_channel just means someone invited them already - not a failure
				if (!res.ok || (!body?.ok && body?.error !== 'already_in_channel')) {
					log.warn('invite failed', { channel, reason: body?.error ?? res.status });
				}
			},
			(err) => log.warn('invite failed', { err, capture: false, channel })
		);
	}
}

export function dm(user: Recipient, text: string): void {
	const token = optional('SLACK_BOT_TOKEN');
	if (!token || !user.slackId) return;

	const base = optional('SLACK_API_BASE', 'https://slack.com/api').replace(/\/$/, '');
	fetch(`${base}/chat.postMessage`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json; charset=utf-8'
		},
		body: JSON.stringify({ channel: user.slackId, text, unfurl_links: false })
	}).then(
		async (res) => {
			const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
			if (!res.ok || !body?.ok) {
				log.warn('send failed', { reason: body?.error ?? res.status });
			}
		},
		(err) => log.warn('send failed', { err, capture: false })
	);
}

function projectLink(projectId: number, title: string): string {
	const base = optional('PUBLIC_BASE_URL', 'http://localhost:5173').replace(/\/$/, '');
	// escape the label so a `>` in the title can't close the link early or
	// inject trailing mrkdwn/links
	return `<${base}/projects/${projectId}|${escapeSlack(title)}>`;
}

function ordersLink(label: string): string {
	const base = optional('PUBLIC_BASE_URL', 'http://localhost:5173').replace(/\/$/, '');
	return `<${base}/orders|${label}>`;
}

const quote = (text: string) => {
	return text.trim()
		? '\n' +
				escapeSlack(text.trim())
					.split('\n')
					.map((l) => `> ${l}`)
					.join('\n')
		: '';
};

/** Sent on HQ authorize - when the sparks actually land, not the held approval. */
export function dmShipApproved(
	user: Recipient,
	project: { id: number; title: string },
	shipNumber: number,
	sparks: number,
	feedback: string
): void {
	dm(
		user,
		`\`[ >w< ]\` *ship #${shipNumber} of ${projectLink(project.id, project.title)} was approved!* ` +
			`*+${sparks} sparks* just landed - spend them in the shop!${quote(feedback)}`
	);
}

export function dmShipRejected(
	user: Recipient,
	project: { id: number; title: string },
	shipNumber: number,
	feedback: string
): void {
	dm(
		user,
		`\`[ >~< ]\` *ship #${shipNumber} of ${projectLink(project.id, project.title)} needs changes.* ` +
			`take a look at the feedback, patch it up, and ship again!${quote(feedback)}`
	);
}

export function dmComment(user: Recipient, project: { id: number; title: string }, comment: string): void {
	dm(user, `\`[ owo ]\` *a reviewer commented on ${projectLink(project.id, project.title)}:*${quote(comment)}`);
}

export function dmOrderStatus(
	user: Recipient,
	order: { id: number; status: string },
	itemName: string,
	reference?: string,
	note?: string
): void {
	const item = escapeSlack(itemName);
	if (order.status === 'fulfilled') {
		dm(
			user,
			`\`[ ^w^ ]\` *your order #${order.id} (${item}) was fulfilled!*` +
				(reference ? `\n> ${escapeSlack(reference)}` : '') +
				quote(note ?? '') +
				`\ncheck ${ordersLink('your orders')} for details.`
		);
	} else if (order.status === 'cancelled') {
		dm(
			user,
			`\`[ >~< ]\` *your order #${order.id} (${item}) was cancelled* - ` +
				`the sparks are back in your balance.${quote(note ?? '')}\nsee ${ordersLink('your orders')}.`
		);
	}
}
