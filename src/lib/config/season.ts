// Program-wide constants. Hours are only ever counted from SEASON_START
// forward - Hackatime activity before the program began doesn't exist to us.
export const SEASON_START = new Date('2026-07-01T00:00:00Z');

/** Minimum tracked seconds (within the ship window) before a project can ship. */
export const MIN_SHIP_SECONDS = 600; // 10 minutes

export const PROGRAM_NAME = 'Anvil';

// ── program closure ───────────────────────────────────────────────────────
// Anvil is over: no new accounts, no new projects, no new ships. Everything
// already in flight stays reviewable, and the shop/orders stay open so people
// can still spend the sparks they earned.
export const PROGRAM_CLOSED = true;

/** One-liner shown wherever a closed gate turns a request down. */
export const CLOSED_NOTICE = 'anvil has ended - signups, new projects, and shipping are closed.';
