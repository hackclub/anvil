// Quests: one-time SCORE bounties for getting a project out into the world -
// never sparks directly. Unlock after the first APPROVED ship (anti-farming);
// auto-granted on completion. Idempotent via project_quests' unique
// (project_id, quest_id) - recomputeScore only runs after that insert succeeds.
import { and, eq } from 'drizzle-orm';
import { QUESTS, type Quest } from '$lib/config/economy';
import { db, schema } from '../db';
import { audit } from '../audit';
import { optional } from '../env';
import { recomputeScore } from './score';

export class QuestError extends Error {}

export function questById(id: string): Quest | undefined {
	return QUESTS.find((q) => q.id === id);
}

export async function questsUnlocked(projectId: number): Promise<boolean> {
	const [approved] = await db()
		.select({ id: schema.ships.id })
		.from(schema.ships)
		.where(and(eq(schema.ships.projectId, projectId), eq(schema.ships.status, 'approved')))
		.limit(1);

	return !!approved;
}

export async function completedQuestIds(projectId: number): Promise<string[]> {
	const rows = await db()
		.select({ questId: schema.projectQuests.questId })
		.from(schema.projectQuests)
		.where(eq(schema.projectQuests.projectId, projectId));

	return rows.map((r) => r.questId);
}

/** github "owner/repo" from a repo URL (same shape preflight uses). */
function repoRef(repoUrl: string | null): string | null {
	const m = repoUrl?.match(/github\.com\/([^/]+\/[^/#?]+)/i);
	return m ? m[1].replace(/\.git$/, '') : null;
}

async function verifyRepoPolish(repoUrl: string | null): Promise<void> {
	const ref = repoRef(repoUrl);
	if (!ref) throw new QuestError('this quest needs a GitHub repo link on your project first!');

	const token = optional('GITHUB_TOKEN');
	const res = await fetch(`https://api.github.com/repos/${ref}`, {
		headers: {
			Accept: 'application/vnd.github+json',
			'User-Agent': 'anvil-quests',
			...(token ? { Authorization: `Bearer ${token}` } : {})
		}
	});

	if (!res.ok) throw new QuestError(`couldn't read your repo (HTTP ${res.status}) - is it public?`);

	const repo = (await res.json()) as { description: string | null; topics?: string[] };
	if (!repo.description?.trim()) {
		throw new QuestError('your repo has no description yet - add one on GitHub, then try again!');
	}

	if ((repo.topics?.length ?? 0) < 2) {
		throw new QuestError('add at least two topics to your repo (the tag chips under the description)!');
	}
}

async function verifyReadmeMention(repoUrl: string | null): Promise<void> {
	const ref = repoRef(repoUrl);
	if (!ref) throw new QuestError('this quest needs a GitHub repo link on your project first!');

	const token = optional('GITHUB_TOKEN');
	const res = await fetch(`https://api.github.com/repos/${ref}/readme`, {
		headers: {
			Accept: 'application/vnd.github.raw+json',
			'User-Agent': 'anvil-quests',
			...(token ? { Authorization: `Bearer ${token}` } : {})
		}
	});

	if (res.status === 404) throw new QuestError('your repo has no README yet - add one first!');

	if (!res.ok) throw new QuestError(`couldn't read your README (HTTP ${res.status}) - is the repo public?`);

	const readme = await res.text();
	if (!/anvil\.hackclub\.com/i.test(readme)) {
		throw new QuestError('we could not find anvil.hackclub.com in your README - add a lil mention, then try again!');
	}
}

function verifyShareUrl(quest: Quest, proofUrl: string): void {
	let host: string;
	try {
		host = new URL(proofUrl).hostname.toLowerCase();
	} catch {
		throw new QuestError('that does not look like a link - paste the URL of your post!');
	}

	const ok = quest.domains?.some((d) => host === d || host.endsWith(`.${d}`));
	if (!ok) {
		throw new QuestError(`the link should point at ${quest.domains?.join(' / ')} - got ${host}`);
	}
}

/** Complete a quest for a project; awards the bounty exactly once. */
export async function completeQuest(
	project: { id: number; userId: number; repoUrl: string | null },
	questId: string,
	proofUrl: string | null
): Promise<void> {
	const quest = questById(questId);
	if (!quest) throw new QuestError('unknown quest');

	if (!(await questsUnlocked(project.id))) {
		throw new QuestError('quests unlock after your first approved ship!');
	}

	if (quest.kind === 'repo-polish') {
		await verifyRepoPolish(project.repoUrl);
		proofUrl = null;
	} else if (quest.kind === 'readme-mention') {
		await verifyReadmeMention(project.repoUrl);
		proofUrl = null;
	} else {
		if (!proofUrl?.trim()) throw new QuestError('paste the link to your post!');

		proofUrl = proofUrl.trim().slice(0, 500);
		verifyShareUrl(quest, proofUrl);
	}

	await db().transaction(async (tx) => {
		const inserted = await tx
			.insert(schema.projectQuests)
			.values({ projectId: project.id, userId: project.userId, questId, proofUrl })
			.onConflictDoNothing()
			.returning({ id: schema.projectQuests.id });

		if (inserted.length === 0) throw new QuestError('already completed - nice try :3');
	});

	// SCORE bump lands here, not sparks - may cross a level threshold and pay
	// retroactive top-ups on prior approved ships, same as a traction change.
	await recomputeScore(project.id);

	audit({
		actorType: 'user',
		actorId: project.userId,
		action: 'quest.complete',
		entityType: 'project',
		entityId: project.id,
		data: { questId, proofUrl }
	});
}
