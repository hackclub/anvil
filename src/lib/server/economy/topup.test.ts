import { describe, expect, test } from 'bun:test';
import { computeTopups, type ApprovedShipEarn } from './topup';

// level rates (economy.ts): LVL 1-3 → $3, 4-6 → $5, 7-9 → $7.5, 10 → $10
const ship = (over: Partial<ApprovedShipEarn> = {}): ApprovedShipEarn => ({
	shipId: 1,
	userId: 1,
	projectId: 1,
	hoursAssigned: 10,
	paidLevel: 1,
	...over
});

describe('computeTopups', () => {
	test('level rise pays the delta on already-paid hours', () => {
		const rows = computeTopups([ship()], 4);
		expect(rows).toHaveLength(1);
		expect(rows[0].amount).toBe(20); // (5 - 3) × 10h
		expect(rows[0].level).toBe(4);
	});

	test('skipped levels produce ONE delta row at the new level', () => {
		const rows = computeTopups([ship()], 10);
		expect(rows).toHaveLength(1);
		expect(rows[0].amount).toBe(70); // (10 - 3) × 10h
	});

	test('levels sharing a rate produce no rows', () => {
		expect(computeTopups([ship()], 2)).toHaveLength(0); // 3 → 3, delta 0
		expect(computeTopups([ship({ paidLevel: 4 })], 6)).toHaveLength(0); // 5 → 5
	});

	test('ships already paid at or above the new level are skipped', () => {
		expect(computeTopups([ship({ paidLevel: 7 })], 7)).toHaveLength(0);
		expect(computeTopups([ship({ paidLevel: 10 })], 4)).toHaveLength(0);
	});

	test('stepwise rises equal one big rise (idempotent total)', () => {
		const step1 = computeTopups([ship()], 4); // 3 → 5
		const step2 = computeTopups([ship({ paidLevel: 4 })], 10); // 5 → 10
		const big = computeTopups([ship()], 10); // 3 → 10
		const total = step1[0].amount + step2[0].amount;
		expect(total).toBe(big[0].amount);
	});

	test('invariant: total paid ≡ hours × rate[current level]', () => {
		// earn_ship at LVL1 (3×h) + topups must always equal rate[final] × h
		const h = 10;
		const base = 3 * h;
		const rows = computeTopups([ship()], 7);
		expect(base + rows[0].amount).toBe(7.5 * h);
	});

	test('multiple ships each get their own row', () => {
		const rows = computeTopups([ship(), ship({ shipId: 2, hoursAssigned: 4, paidLevel: 4 })], 7);
		expect(rows).toHaveLength(2);
		expect(rows[1].amount).toBe(10); // (7.5 - 5) × 4h
	});
});
