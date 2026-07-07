// The internal activity feed: new signups, new projects, and new ships get
// posted to a Slack channel via an incoming webhook (SLACK_FEED_WEBHOOK).
// Fire-and-forget like the audit trail - a Slack hiccup must never break
// the action being reported. No webhook configured = silently off (dev).
import { and, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { optional } from '../env';
import { escapeSlack } from './slackText';

export function feed(text: string): void {
	const url = optional('SLACK_FEED_WEBHOOK');
	if (!url) return;

	fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text })
	}).then(
		(res) => {
			if (!res.ok) {
				console.warn('[slack-feed] post failed:', res.status);
			}
		},
		(err) => console.warn('[slack-feed] post failed:', err)
	);
}

/** `<@U...>` mentions for every admin with a linked slack id. */
async function adminMentions(): Promise<string> {
	const admins = await db()
		.select({ slackId: schema.users.slackId })
		.from(schema.users)
		.where(and(eq(schema.users.isAdmin, true), isNotNull(schema.users.slackId)));

	return admins.map((a) => `<@${a.slackId}>`).join(' ');
}

const who = (u: { username: string | null; email: string }) => escapeSlack(u.username || u.email);

export function feedSignup(user: { username: string | null; email: string }): void {
	feed(`:sparkles: new hacker! *${who(user)}* just signed up`);
}

export function feedNewProject(user: { username: string | null; email: string }, title: string): void {
	feed(`:hammer_and_pick: *${who(user)}* started a new project: *${escapeSlack(title)}*`);
}

/** Ships ping every admin - review time! */
export function feedShip(
	user: { username: string | null; email: string },
	projectTitle: string,
	shipNumber: number,
	seconds: number
): void {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const title = escapeSlack(projectTitle);
	adminMentions().then(
		(mentions) => {
			return feed(
				`:ship: *${who(user)}* shipped *${title}* (ship #${shipNumber} · ${h}h ${m}m)${mentions ? ` ${mentions}` : ''}`
			);
		},
		() => feed(`:ship: *${who(user)}* shipped *${title}* (ship #${shipNumber})`)
	);
}
