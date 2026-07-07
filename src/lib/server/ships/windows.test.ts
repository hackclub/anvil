import { describe, expect, test } from 'bun:test';
import { SEASON_START } from '$lib/config/season';
import { shipWindow, windowSeconds } from './windows';

const d = (s: string) => new Date(s);

describe('shipWindow', () => {
	test('first ship: window = [seasonStart, now]', () => {
		const now = d('2026-07-10T12:00:00Z');
		const w = shipWindow(null, now);
		expect(w.start.getTime()).toBe(SEASON_START.getTime());
		expect(w.end.getTime()).toBe(now.getTime());
	});

	test('re-ship after approval anchors on the approved ship submittedAt (window_end)', () => {
		const approvedSubmittedAt = d('2026-07-05T09:00:00Z');
		const now = d('2026-07-20T18:00:00Z');
		const w = shipWindow(approvedSubmittedAt, now);
		expect(w.start.getTime()).toBe(approvedSubmittedAt.getTime());
		expect(w.end.getTime()).toBe(now.getTime());
	});

	test('re-ship after REJECTION does not advance the window (only approvals anchor)', () => {
		// callers pass the latest APPROVED ship's window_end; a rejection means
		// the anchor is unchanged, so the same start is recomputed with later end.
		const now1 = d('2026-07-08T00:00:00Z');
		const now2 = d('2026-07-09T00:00:00Z'); // re-ship after a rejection
		const w1 = shipWindow(null, now1);
		const w2 = shipWindow(null, now2);
		expect(w2.start.getTime()).toBe(w1.start.getTime());
		expect(w2.end.getTime()).toBeGreaterThan(w1.end.getTime());
	});

	test('windows tile losslessly: consecutive approvals share boundaries', () => {
		const s1 = d('2026-07-05T09:00:00Z');
		const s2 = d('2026-07-19T14:00:00Z');
		const w1 = shipWindow(null, s1); // first ship, submitted at s1, approved
		const w2 = shipWindow(s1, s2); // second ship
		const w3 = shipWindow(s2, d('2026-08-01T00:00:00Z'));
		expect(w1.end.getTime()).toBe(w2.start.getTime());
		expect(w2.end.getTime()).toBe(w3.start.getTime());
	});
});

describe('windowSeconds', () => {
	test('sums per-key seconds', () => {
		expect(
			windowSeconds([
				{ key: 'a', seconds: 100 },
				{ key: 'b', seconds: 250 }
			])
		).toBe(350);

		expect(windowSeconds([])).toBe(0);
	});
});
