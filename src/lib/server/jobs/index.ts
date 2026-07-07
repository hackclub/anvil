// pg-boss boot. Jobs run in-process with the web server (single instance for
// launch; pg-boss's Postgres locking makes scale-out safe later). Each phase
// registers its queues here via the REGISTRY below.
import { PgBoss, type SendOptions, type WorkHandler, type WorkOptions } from 'pg-boss';
import { optional } from '../env';

export interface JobRegistration {
	queue: string;
	/** cron expression, if this queue is scheduled (jobs can also be sent ad-hoc) */
	cron?: string;
	handler: WorkHandler<object>;
	options?: WorkOptions;
}

// Populated by later phases (traction pollers, airtable sync, refreshers…).
const REGISTRY: JobRegistration[] = [];

export function registerJob(reg: JobRegistration) {
	REGISTRY.push(reg);
}

let boss: PgBoss | null = null;

export function getBoss(): PgBoss {
	if (!boss) throw new Error('pg-boss not started');

	return boss;
}

/** Enqueue a one-off job (no-op with a warning if jobs are disabled). */
export async function enqueue(queue: string, data: object, options?: SendOptions): Promise<void> {
	if (!boss) {
		console.warn(`[jobs] boss not running; dropping job ${queue}`);
		return;
	}

	await boss.send(queue, data, options ?? {});
}

export async function startJobs(): Promise<void> {
	const url = optional('DATABASE_URL');
	if (!url) {
		console.warn('[jobs] DATABASE_URL not set - background jobs disabled');
		return;
	}

	if (boss) return;

	boss = new PgBoss({ connectionString: url });
	boss.on('error', (err: Error) => console.error('[jobs] pg-boss error:', err));
	await boss.start();

	for (const reg of REGISTRY) {
		await boss.createQueue(reg.queue);
		await boss.work(reg.queue, reg.options ?? {}, reg.handler);
		if (reg.cron) {
			await boss.schedule(reg.queue, reg.cron, {}, { tz: 'UTC' });
		}
	}

	console.log(`[jobs] pg-boss started (${REGISTRY.length} queues)`);
}

export async function stopJobs(): Promise<void> {
	if (!boss) return;

	await boss.stop({ close: true });
	boss = null;
}
