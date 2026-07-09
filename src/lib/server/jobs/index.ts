// pg-boss boot. Jobs run in-process with the web server (single instance for
// launch; pg-boss's Postgres locking makes scale-out safe later). Each phase
// registers its queues here via the REGISTRY below.
import { PgBoss, type SendOptions, type WorkHandler, type WorkOptions } from 'pg-boss';
import { optional } from '../env';
import { createLogger } from '$lib/log';

const log = createLogger('jobs');

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
		log.warn('boss not running; dropping job', { queue });
		return;
	}

	log.debug('enqueue', { queue });
	await boss.send(queue, data, options ?? {});
}

// Wrap every queue handler so each run emits a start/finish (or failure) line
// with timing + batch size - central instrumentation for ALL jobs, so a new
// queue is logged the moment it's registered, no per-handler code.
function instrument(queue: string, handler: WorkHandler<object>): WorkHandler<object> {
	return async (jobs) => {
		const batch = Array.isArray(jobs) ? jobs.length : 1;
		const start = performance.now();
		log.info('job start', { queue, batch });
		try {
			const result = await handler(jobs);
			log.info('job done', { queue, batch, ms: Math.round(performance.now() - start) });
			return result;
		} catch (err) {
			// pg-boss will retry per the queue's retry options; surface every attempt.
			log.exception('job failed', err, { queue, batch, ms: Math.round(performance.now() - start) });
			throw err;
		}
	};
}

export async function startJobs(): Promise<void> {
	const url = optional('DATABASE_URL');
	if (!url) {
		log.warn('DATABASE_URL not set - background jobs disabled');
		return;
	}

	if (boss) return;

	boss = new PgBoss({ connectionString: url });
	boss.on('error', (err: Error) => log.exception('pg-boss error', err));
	await boss.start();

	for (const reg of REGISTRY) {
		await boss.createQueue(reg.queue);
		await boss.work(reg.queue, reg.options ?? {}, instrument(reg.queue, reg.handler));
		if (reg.cron) {
			await boss.schedule(reg.queue, reg.cron, {}, { tz: 'UTC' });
		}
	}

	log.info('pg-boss started', { queues: REGISTRY.length });
}

export async function stopJobs(): Promise<void> {
	if (!boss) return;

	await boss.stop({ close: true });
	boss = null;
}
