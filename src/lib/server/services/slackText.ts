// Slack requires three characters to be HTML-escaped in message text so that
// user content can't inject control sequences: mentions like <!channel> /
// <!everyone>, fake <url|label> links, or a stray `>` that closes a real link
// early. Everything user-controlled (project titles, usernames, item names,
// reviewer feedback, notes) must pass through here before interpolation.
// https://api.slack.com/reference/surfaces/formatting#escaping
export function escapeSlack(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
