// Append-only sparks ledger. Balances are sums; earns are idempotent through
// the unique (ship_id, kind, level) partial index - a retried award is a no-op.
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db';

export interface AwardInput {
	userId: number;
	kind: 'earn_ship' | 'earn_topup' | 'adjustment';
	amount: number;
	projectId?: number;
	shipId?: number;
	level?: number;
	rate?: number;
	hoursBasis?: number;
	note?: string;
	createdByActorId?: string;
}

export async function award(input: AwardInput): Promise<void> {
	if (input.amount === 0) return;

	await db().insert(schema.currencyLedger).values(input).onConflictDoNothing();
}

export async function balanceOf(userId: number): Promise<number> {
	const [row] = await db()
		.select({ balance: sql<string>`coalesce(sum(${schema.currencyLedger.amount}), 0)` })
		.from(schema.currencyLedger)
		.where(eq(schema.currencyLedger.userId, userId));

	return Number(row?.balance ?? 0);
}
