// The economy in one tunable constant.
//
// Rates are in USD-equivalent per approved hour. Budget reality: HQ disburses
// $8.50/hr per weighted hour on average ($85 per 10-hour WP); LVL 1 keeps
// low-traction projects near $3/hr and LVL 10 is the HARD $10/hr ceiling.
// Because traction follows a power law, the realized average sits well under
// budget - the weekly budget.audit job alerts if it ever creeps past target.
//
// SCORE - the video-game framing of adoption. Everything is weighed in
// star-equivalents ("how hard is it to get one from a real human?"):
//   1 GitHub star = 1 SCORE ≈ 50 npm/pypi weekly downloads
//                           ≈ 100 crates downloads (Rust CI is spammy)
//                           ≈ 10 extension installs
// Social (likes/upvotes) is NEVER scored - it's unpollable and farmable.
// Sharing pays a one-time quest bounty instead; if the share lands, the
// stars/downloads it generates move SCORE organically.

export interface ScoreLevel {
	/** 1-indexed level. */
	level: number;
	/** SCORE required to reach this level. */
	minScore: number;
	/** Sparks earned per approved hour at this level (1 spark = $1-equivalent). */
	ratePerHour: number;
	/** Level is computed but not applied until staff sign off in /admin/score. */
	requiresReview?: boolean;
}

export interface Quest {
	id: string;
	/** Checklist label on the project page. */
	title: string;
	/** One-time bounty, in sparks. */
	sparks: number;
	/** repo-polish / readme-mention = auto-verified via GitHub; share = proof URL. */
	kind: 'repo-polish' | 'readme-mention' | 'share';
	/** Allowed proof-URL hostnames (suffix match) for share quests. */
	domains?: string[];
	/** Extra note shown in the confirm modal (e.g. the be-respectful nudge). */
	note?: string;
}

const RESPECT = "be respectful, follow the community's rules, and never spam - one genuine post!";

export const QUESTS: Quest[] = [
	{
		id: 'repo-polish',
		title: 'polish your GitHub repo',
		sparks: 1,
		kind: 'repo-polish',
		note: "we'll check your repo for a description and at least two topics!"
	},
	{
		id: 'readme-anvil',
		title: 'mention Anvil in your README',
		sparks: 1,
		kind: 'readme-mention',
		note: "we'll look for a link to anvil.hackclub.com anywhere in your README!"
	},
	{
		id: 'share-reddit',
		title: 'share it on Reddit',
		sparks: 1,
		kind: 'share',
		domains: ['reddit.com'],
		note: RESPECT
	},
	{
		id: 'share-social',
		title: 'share it on Bluesky / Twitter',
		sparks: 1,
		kind: 'share',
		domains: ['bsky.app', 'twitter.com', 'x.com'],
		note: RESPECT
	},
	{
		id: 'share-hn',
		title: 'share it on Hacker News',
		sparks: 1,
		kind: 'share',
		domains: ['news.ycombinator.com'],
		note: RESPECT
	}
];

export const ECONOMY = {
	/** Display name of the currency. */
	currencyName: 'sparks',

	/** SCORE = Σ weight × latest metric value, over verified sources only */
	weights: {
		github_repo: 1, // stars - the anchor: 1 star = 1 SCORE
		npm: 0.02, // weekly downloads (50 dl = 1 SCORE; CI/bot noise)
		pypi: 0.02, // weekly downloads
		crates: 0.01, // recent downloads (100 = 1; Rust CI re-pulls a lot)
		chrome_ext: 0.1, // installs (10 = 1; a human chose to keep it)
		firefox_addon: 0.1 // installs
	} as Record<string, number>,

	/** Ten levels; the rate steps at LVL 1 / 4 / 7 / 10. */
	levels: [
		{ level: 1, minScore: 0, ratePerHour: 3.0 },
		{ level: 2, minScore: 3, ratePerHour: 3.0 },
		{ level: 3, minScore: 6, ratePerHour: 3.0 },
		{ level: 4, minScore: 10, ratePerHour: 5.0 },
		{ level: 5, minScore: 20, ratePerHour: 5.0 },
		{ level: 6, minScore: 35, ratePerHour: 5.0 },
		{ level: 7, minScore: 60, ratePerHour: 7.5, requiresReview: true },
		{ level: 8, minScore: 100, ratePerHour: 7.5, requiresReview: true },
		{ level: 9, minScore: 160, ratePerHour: 7.5, requiresReview: true },
		{ level: 10, minScore: 250, ratePerHour: 10.0, requiresReview: true }
	] satisfies ScoreLevel[],

	/** Structural ceiling - no level may ever exceed this rate. */
	hardCapRatePerHour: 10.0,

	/** Alert threshold for the weekly budget audit (realized Σ$ / Σhr). */
	budgetAvgTarget: 8.5,

	/** Star-velocity anti-abuse: flag if a source gains more than maxDelta
	 *  within windowHours, or grows by more than maxRatioPerDay of its base. */
	starVelocityFlag: { windowHours: 24, maxDelta: 50, maxRatioPerDay: 0.5 },

	/** Default max level applied without staff review (projects.max_reviewed_level). */
	defaultMaxReviewedLevel: 6
} as const;

export function levelFor(score: number): ScoreLevel {
	let best = ECONOMY.levels[0];
	for (const l of ECONOMY.levels)
		if (score >= l.minScore) {
			best = l;
		}

	return best;
}

export function levelSpec(level: number): ScoreLevel {
	const l = ECONOMY.levels.find((l) => l.level === level);
	if (!l) throw new Error(`unknown level ${level}`);

	return l;
}

export function rateForLevel(level: number): number {
	return Math.min(levelSpec(level).ratePerHour, ECONOMY.hardCapRatePerHour);
}
