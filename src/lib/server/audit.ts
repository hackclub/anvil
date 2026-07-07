// PaperTrail-lite. Call audit() next to anything worth remembering - it
// writes fire-and-forget and NEVER throws, so it can't break the action
// it's describing.
import { db, schema } from './db';

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
	db()
		.insert(schema.auditLogs)
		.values({
			...entry,
			actorId: entry.actorId == null ? entry.actorId : String(entry.actorId),
			entityId: entry.entityId == null ? undefined : String(entry.entityId)
		})
		.then(
			() => {},
			(err) => console.warn('[audit] write failed:', entry.action, err)
		);
}
