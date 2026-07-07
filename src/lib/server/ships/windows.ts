// Hour windows tile losslessly: [seasonStart, s1], [s1, s2], ... where s_i are
// the submission times (window_end) of APPROVED ships. Rules:
// - only approvals advance the window (a rejection's re-ship recomputes the
//   same start with a later end, so fix-up time counts)
// - the anchor is the approved ship's *submittedAt*, not its decision time -
//   the submit→approve gap is never silently dropped
// Pure function; the db lookup lives in ship.ts.
import { SEASON_START } from '$lib/config/season';

export interface ShipWindow {
	start: Date;
	end: Date;
}

export function shipWindow(lastApprovedWindowEnd: Date | null, now: Date): ShipWindow {
	const start = lastApprovedWindowEnd ?? SEASON_START;
	return { start, end: now };
}

export function windowSeconds(perKey: { key: string; seconds: number }[]): number {
	return perKey.reduce((acc, k) => acc + k.seconds, 0);
}
