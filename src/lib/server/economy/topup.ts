// Retroactive top-up: when a project's applied level rises, every previously
// approved ship earns the delta between its already-paid rate and the new
// rate. Idempotent via the (ship_id, kind, level) unique index. Levels that
// share a rate produce a zero delta and no row.
import { rateForLevel } from '$lib/config/economy';

export interface ApprovedShipEarn {
	shipId: number;
	userId: number;
	projectId: number;
	hoursAssigned: number;
	/** highest level this ship has already been paid at (earn_ship or topup) */
	paidLevel: number;
}

export interface TopupRow {
	userId: number;
	kind: 'earn_topup';
	amount: number;
	projectId: number;
	shipId: number;
	level: number;
	rate: number;
	hoursBasis: number;
}

/** Pure: which topup ledger rows does a rise to `newLevel` produce? */
export function computeTopups(ships: ApprovedShipEarn[], newLevel: number): TopupRow[] {
	const newRate = rateForLevel(newLevel);
	const rows: TopupRow[] = [];
	for (const s of ships) {
		if (s.paidLevel >= newLevel) continue;

		const delta = Math.round((newRate - rateForLevel(s.paidLevel)) * s.hoursAssigned * 100) / 100;
		if (delta <= 0) continue;

		rows.push({
			userId: s.userId,
			kind: 'earn_topup',
			amount: delta,
			projectId: s.projectId,
			shipId: s.shipId,
			level: newLevel,
			rate: newRate,
			hoursBasis: s.hoursAssigned
		});
	}

	return rows;
}
