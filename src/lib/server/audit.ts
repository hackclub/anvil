// PaperTrail-lite. Call audit() next to anything worth remembering - it
// writes fire-and-forget and NEVER throws, so it can't break the action
// it's describing.
import { createLogger } from '$lib/log';
import { db, schema } from './db';

const log = createLogger('audit');

export interface AuditEntry {
	actorType: 'user' | 'sidekick' | 'admin' | 'system';
	/** user id, reviewer actor id, admin email, job name... */
	actorId?: string | number | null;
	/** dotted verb, e.g. 'ship.create', 'order.cancel', 'admin.set_field' */
	action: string;
	entityType?: string;
	entityId?: string | number;
	/** free-form context: changed fields, amounts, reasons */
	data?: Record<string, unknown>;
}

export function audit(entry: AuditEntry): void {
	// Mirror every audited action to the log stream too, so the ops timeline is
	// visible in stdout/Sentry without a DB query. The DB row stays the source
	// of truth; this is the breadcrumb.
	log.info('audit', {
		action: entry.action,
		actorType: entry.actorType,
		actorId: entry.actorId ?? null,
		entityType: entry.entityType ?? null,
		entityId: entry.entityId ?? null
	});

	db()
		.insert(schema.auditLogs)
		.values({
			...entry,
			actorId: entry.actorId == null ? entry.actorId : String(entry.actorId),
			entityId: entry.entityId == null ? undefined : String(entry.entityId)
		})
		.then(
			() => {},
			(err) => log.warn('write failed', { err, capture: false, action: entry.action })
		);
}
